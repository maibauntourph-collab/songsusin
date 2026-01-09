package com.example.audioguide

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.content.Intent
import android.util.Log
import java.io.File

enum class AudioState {
    IDLE,
    RECORDING,
    LISTENING,
    PAUSED_FOR_STT
}

interface AudioSessionCallback {
    fun onStateChanged(state: AudioState)
    fun onRecordingStarted(filePath: String)
    fun onRecordingStopped(filePath: String)
    fun onRecordingPaused()
    fun onRecordingResumed()
    fun onSpeechResult(text: String, isFinal: Boolean)
    fun onSpeechError(errorCode: Int, errorMessage: String)
    fun onAudioFocusChanged(hasFocus: Boolean)
}

class AudioSessionManager(
    private val context: Context,
    private val callback: AudioSessionCallback
) {
    companion object {
        private const val TAG = "AudioSessionManager"
    }

    private var currentState: AudioState = AudioState.IDLE
    private var mediaRecorder: MediaRecorder? = null
    private var speechRecognizer: SpeechRecognizer? = null
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    
    private var currentRecordingPath: String? = null
    private var wasRecordingBeforeSTT = false
    private var pendingResumeRecording = false
    
    private val mainHandler = Handler(Looper.getMainLooper())

    init {
        audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        initializeSpeechRecognizer()
    }

    val state: AudioState get() = currentState
    val isRecording: Boolean get() = currentState == AudioState.RECORDING
    val isListening: Boolean get() = currentState == AudioState.LISTENING
    val isBusy: Boolean get() = currentState != AudioState.IDLE

    private fun setState(newState: AudioState) {
        if (currentState != newState) {
            Log.d(TAG, "State changed: $currentState -> $newState")
            currentState = newState
            callback.onStateChanged(newState)
        }
    }

    private fun initializeSpeechRecognizer() {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            Log.e(TAG, "Speech recognition not available on this device")
            return
        }
        
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    Log.d(TAG, "STT: Ready for speech")
                }

                override fun onBeginningOfSpeech() {
                    Log.d(TAG, "STT: Speech started")
                }

                override fun onRmsChanged(rmsdB: Float) {}

                override fun onBufferReceived(buffer: ByteArray?) {}

                override fun onEndOfSpeech() {
                    Log.d(TAG, "STT: Speech ended")
                }

                override fun onError(error: Int) {
                    val errorMessage = getSpeechErrorMessage(error)
                    Log.e(TAG, "STT Error: $error - $errorMessage")
                    callback.onSpeechError(error, errorMessage)
                    
                    if (error != SpeechRecognizer.ERROR_CLIENT) {
                        handleSTTComplete()
                    }
                }

                override fun onResults(results: Bundle?) {
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val text = matches?.firstOrNull() ?: ""
                    Log.d(TAG, "STT Final Result: $text")
                    callback.onSpeechResult(text, true)
                    handleSTTComplete()
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val text = matches?.firstOrNull() ?: ""
                    if (text.isNotEmpty()) {
                        Log.d(TAG, "STT Partial: $text")
                        callback.onSpeechResult(text, false)
                    }
                }

                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
        }
    }

    private fun getSpeechErrorMessage(errorCode: Int): String {
        return when (errorCode) {
            SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
            SpeechRecognizer.ERROR_CLIENT -> "Client side error"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
            SpeechRecognizer.ERROR_NETWORK -> "Network error"
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
            SpeechRecognizer.ERROR_NO_MATCH -> "No speech match"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer busy"
            SpeechRecognizer.ERROR_SERVER -> "Server error"
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech input"
            else -> "Unknown error: $errorCode"
        }
    }

    private fun requestAudioFocus(): Boolean {
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                .setAudioAttributes(audioAttributes)
                .setAcceptsDelayedFocusGain(false)
                .setOnAudioFocusChangeListener { focusChange ->
                    when (focusChange) {
                        AudioManager.AUDIOFOCUS_GAIN -> {
                            Log.d(TAG, "Audio focus gained")
                            callback.onAudioFocusChanged(true)
                        }
                        AudioManager.AUDIOFOCUS_LOSS,
                        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
                        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                            Log.d(TAG, "Audio focus lost: $focusChange")
                            callback.onAudioFocusChanged(false)
                            handleAudioFocusLoss()
                        }
                    }
                }
                .build()

            val result = audioManager?.requestAudioFocus(audioFocusRequest!!)
            return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        } else {
            @Suppress("DEPRECATION")
            val result = audioManager?.requestAudioFocus(
                { focusChange ->
                    when (focusChange) {
                        AudioManager.AUDIOFOCUS_GAIN -> callback.onAudioFocusChanged(true)
                        else -> {
                            callback.onAudioFocusChanged(false)
                            handleAudioFocusLoss()
                        }
                    }
                },
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE
            )
            return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
    }

    private fun abandonAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let {
                audioManager?.abandonAudioFocusRequest(it)
            }
        } else {
            @Suppress("DEPRECATION")
            audioManager?.abandonAudioFocus(null)
        }
    }

    private fun handleAudioFocusLoss() {
        when (currentState) {
            AudioState.RECORDING -> {
                Log.d(TAG, "Pausing recording due to audio focus loss")
                pauseRecordingInternal()
            }
            AudioState.LISTENING -> {
                Log.d(TAG, "Stopping STT due to audio focus loss")
                stopListeningInternal()
            }
            else -> {}
        }
    }

    fun startRecording(outputPath: String? = null): Boolean {
        Log.d(TAG, "startRecording() called, current state: $currentState")
        
        if (currentState == AudioState.LISTENING) {
            Log.w(TAG, "Cannot start recording while STT is active. Stop listening first.")
            return false
        }
        
        if (currentState == AudioState.RECORDING) {
            Log.w(TAG, "Already recording")
            return true
        }

        if (!requestAudioFocus()) {
            Log.e(TAG, "Failed to acquire audio focus for recording")
            return false
        }

        try {
            val recordingPath = outputPath ?: generateRecordingPath()
            currentRecordingPath = recordingPath

            mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(128000)
                setAudioSamplingRate(44100)
                setOutputFile(recordingPath)
                prepare()
                start()
            }

            setState(AudioState.RECORDING)
            callback.onRecordingStarted(recordingPath)
            Log.d(TAG, "Recording started: $recordingPath")
            return true

        } catch (e: Exception) {
            Log.e(TAG, "Failed to start recording", e)
            releaseMediaRecorder()
            abandonAudioFocus()
            return false
        }
    }

    fun stopRecording(): String? {
        Log.d(TAG, "stopRecording() called, current state: $currentState")
        
        if (currentState != AudioState.RECORDING && currentState != AudioState.PAUSED_FOR_STT) {
            Log.w(TAG, "Not currently recording")
            return null
        }

        val path = stopRecordingInternal()
        abandonAudioFocus()
        setState(AudioState.IDLE)
        wasRecordingBeforeSTT = false
        pendingResumeRecording = false
        return path
    }

    private fun stopRecordingInternal(): String? {
        val path = currentRecordingPath
        try {
            mediaRecorder?.apply {
                stop()
                release()
            }
            path?.let { callback.onRecordingStopped(it) }
            Log.d(TAG, "Recording stopped: $path")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping recording", e)
        }
        mediaRecorder = null
        currentRecordingPath = null
        return path
    }

    private fun pauseRecordingInternal() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                mediaRecorder?.pause()
                Log.d(TAG, "Recording paused")
                callback.onRecordingPaused()
            } else {
                stopRecordingInternal()
                Log.d(TAG, "Recording stopped (pause not supported on this API level)")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error pausing recording", e)
            stopRecordingInternal()
        }
    }

    private fun resumeRecordingInternal() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && mediaRecorder != null) {
                mediaRecorder?.resume()
                setState(AudioState.RECORDING)
                Log.d(TAG, "Recording resumed")
                callback.onRecordingResumed()
            } else if (wasRecordingBeforeSTT) {
                val newPath = generateRecordingPath()
                if (startRecording(newPath)) {
                    Log.d(TAG, "Recording restarted with new file: $newPath")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error resuming recording", e)
        }
    }

    fun startListening(language: String = "ko-KR", autoResumeRecording: Boolean = true): Boolean {
        Log.d(TAG, "startListening() called, current state: $currentState, autoResume: $autoResumeRecording")
        
        if (speechRecognizer == null) {
            Log.e(TAG, "SpeechRecognizer not initialized")
            return false
        }

        if (currentState == AudioState.LISTENING) {
            Log.w(TAG, "Already listening")
            return true
        }

        if (currentState == AudioState.RECORDING) {
            Log.d(TAG, "Pausing recording before starting STT")
            wasRecordingBeforeSTT = true
            pendingResumeRecording = autoResumeRecording
            pauseRecordingInternal()
            setState(AudioState.PAUSED_FOR_STT)
        }

        if (!requestAudioFocus()) {
            Log.e(TAG, "Failed to acquire audio focus for STT")
            if (wasRecordingBeforeSTT && pendingResumeRecording) {
                resumeRecordingInternal()
            }
            return false
        }

        try {
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }

            speechRecognizer?.startListening(intent)
            setState(AudioState.LISTENING)
            Log.d(TAG, "STT started with language: $language")
            return true

        } catch (e: Exception) {
            Log.e(TAG, "Failed to start STT", e)
            abandonAudioFocus()
            if (wasRecordingBeforeSTT && pendingResumeRecording) {
                resumeRecordingInternal()
            }
            return false
        }
    }

    fun stopListening() {
        Log.d(TAG, "stopListening() called, current state: $currentState")
        
        if (currentState != AudioState.LISTENING) {
            Log.w(TAG, "Not currently listening")
            return
        }

        stopListeningInternal()
        handleSTTComplete()
    }

    private fun stopListeningInternal() {
        try {
            speechRecognizer?.stopListening()
            Log.d(TAG, "STT stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping STT", e)
        }
    }

    private fun handleSTTComplete() {
        Log.d(TAG, "handleSTTComplete() - wasRecordingBeforeSTT: $wasRecordingBeforeSTT, pendingResume: $pendingResumeRecording")
        
        abandonAudioFocus()

        if (wasRecordingBeforeSTT && pendingResumeRecording) {
            mainHandler.postDelayed({
                Log.d(TAG, "Auto-resuming recording after STT")
                resumeRecordingInternal()
                wasRecordingBeforeSTT = false
                pendingResumeRecording = false
            }, 300)
        } else {
            setState(AudioState.IDLE)
            wasRecordingBeforeSTT = false
            pendingResumeRecording = false
        }
    }

    private fun generateRecordingPath(): String {
        val timestamp = System.currentTimeMillis()
        val dir = context.getExternalFilesDir(null) ?: context.filesDir
        return File(dir, "recording_$timestamp.m4a").absolutePath
    }

    private fun releaseMediaRecorder() {
        try {
            mediaRecorder?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing MediaRecorder", e)
        }
        mediaRecorder = null
    }

    fun release() {
        Log.d(TAG, "release() called")
        
        if (currentState == AudioState.RECORDING) {
            stopRecording()
        }
        if (currentState == AudioState.LISTENING) {
            stopListening()
        }

        releaseMediaRecorder()
        speechRecognizer?.destroy()
        speechRecognizer = null
        abandonAudioFocus()
        
        setState(AudioState.IDLE)
    }
}
