package com.example.audioguide

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity(), AudioSessionCallback {
    
    companion object {
        private const val TAG = "MainActivity"
        private const val PERMISSION_REQUEST_CODE = 1001
        private val REQUIRED_PERMISSIONS = arrayOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.WRITE_EXTERNAL_STORAGE
        )
    }

    private lateinit var audioSessionManager: AudioSessionManager
    
    private lateinit var btnRecord: Button
    private lateinit var btnListen: Button
    private lateinit var tvStatus: TextView
    private lateinit var tvTranscript: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        initViews()
        
        if (checkPermissions()) {
            initAudioSessionManager()
        } else {
            requestPermissions()
        }
    }

    private fun initViews() {
        btnRecord = findViewById(R.id.btn_record)
        btnListen = findViewById(R.id.btn_listen)
        tvStatus = findViewById(R.id.tv_status)
        tvTranscript = findViewById(R.id.tv_transcript)

        btnRecord.setOnClickListener {
            handleRecordClick()
        }

        btnListen.setOnClickListener {
            handleListenClick()
        }
    }

    private fun initAudioSessionManager() {
        audioSessionManager = AudioSessionManager(this, this)
        updateUI()
    }

    private fun handleRecordClick() {
        when (audioSessionManager.state) {
            AudioState.IDLE, AudioState.PAUSED_FOR_STT -> {
                if (audioSessionManager.startRecording()) {
                    Toast.makeText(this, "Recording started", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this, "Failed to start recording", Toast.LENGTH_SHORT).show()
                }
            }
            AudioState.RECORDING -> {
                val path = audioSessionManager.stopRecording()
                Toast.makeText(this, "Recording saved: $path", Toast.LENGTH_LONG).show()
            }
            AudioState.LISTENING -> {
                Toast.makeText(this, "Stop listening first", Toast.LENGTH_SHORT).show()
            }
        }
        updateUI()
    }

    private fun handleListenClick() {
        when (audioSessionManager.state) {
            AudioState.IDLE, AudioState.RECORDING, AudioState.PAUSED_FOR_STT -> {
                if (audioSessionManager.startListening("ko-KR", autoResumeRecording = true)) {
                    Toast.makeText(this, "Listening...", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this, "Failed to start STT", Toast.LENGTH_SHORT).show()
                }
            }
            AudioState.LISTENING -> {
                audioSessionManager.stopListening()
                Toast.makeText(this, "Stopped listening", Toast.LENGTH_SHORT).show()
            }
        }
        updateUI()
    }

    private fun updateUI() {
        runOnUiThread {
            val state = audioSessionManager.state
            tvStatus.text = "State: $state"

            btnRecord.text = when (state) {
                AudioState.RECORDING -> "Stop Recording"
                AudioState.PAUSED_FOR_STT -> "Recording Paused"
                else -> "Start Recording"
            }

            btnListen.text = when (state) {
                AudioState.LISTENING -> "Stop Listening"
                else -> "Start Listening (STT)"
            }

            btnRecord.isEnabled = state != AudioState.LISTENING
            btnListen.isEnabled = true
        }
    }

    override fun onStateChanged(state: AudioState) {
        Log.d(TAG, "State changed: $state")
        updateUI()
    }

    override fun onRecordingStarted(filePath: String) {
        Log.d(TAG, "Recording started: $filePath")
    }

    override fun onRecordingStopped(filePath: String) {
        Log.d(TAG, "Recording stopped: $filePath")
    }

    override fun onRecordingPaused() {
        Log.d(TAG, "Recording paused")
        runOnUiThread {
            Toast.makeText(this, "Recording paused for STT", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onRecordingResumed() {
        Log.d(TAG, "Recording resumed")
        runOnUiThread {
            Toast.makeText(this, "Recording resumed", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onSpeechResult(text: String, isFinal: Boolean) {
        Log.d(TAG, "Speech result (final=$isFinal): $text")
        runOnUiThread {
            val prefix = if (isFinal) "[Final] " else "[Interim] "
            tvTranscript.text = prefix + text
        }
    }

    override fun onSpeechError(errorCode: Int, errorMessage: String) {
        Log.e(TAG, "Speech error: $errorCode - $errorMessage")
        runOnUiThread {
            Toast.makeText(this, "STT Error: $errorMessage", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onAudioFocusChanged(hasFocus: Boolean) {
        Log.d(TAG, "Audio focus changed: $hasFocus")
    }

    private fun checkPermissions(): Boolean {
        return REQUIRED_PERMISSIONS.all {
            ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun requestPermissions() {
        ActivityCompat.requestPermissions(this, REQUIRED_PERMISSIONS, PERMISSION_REQUEST_CODE)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        
        if (requestCode == PERMISSION_REQUEST_CODE) {
            if (grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
                initAudioSessionManager()
            } else {
                Toast.makeText(this, "Permissions required for audio features", Toast.LENGTH_LONG).show()
                finish()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::audioSessionManager.isInitialized) {
            audioSessionManager.release()
        }
    }
}
