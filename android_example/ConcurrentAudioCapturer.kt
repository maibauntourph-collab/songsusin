package com.example.audioguide

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

interface AudioChunkListener {
    fun onAudioChunkReady(bytes: ByteArray, bytesRead: Int)
    fun onCaptureStarted()
    fun onCaptureStopped()
    fun onError(error: String)
}

class ConcurrentAudioCapturer(
    private val sampleRate: Int = 16000,
    private val channelConfig: Int = AudioFormat.CHANNEL_IN_MONO,
    private val audioFormat: Int = AudioFormat.ENCODING_PCM_16BIT
) {
    companion object {
        private const val TAG = "ConcurrentAudioCapturer"
    }

    private var audioRecord: AudioRecord? = null
    private var captureThread: Thread? = null
    private var fileOutputStream: FileOutputStream? = null
    
    private val isCapturing = AtomicBoolean(false)
    private val isPaused = AtomicBoolean(false)
    
    private var outputFile: File? = null
    private var chunkListener: AudioChunkListener? = null
    private var totalBytesWritten: Long = 0
    
    private val bufferSize: Int by lazy {
        val minSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
        maxOf(minSize * 2, 4096)
    }

    val isRunning: Boolean get() = isCapturing.get()

    fun setChunkListener(listener: AudioChunkListener?) {
        this.chunkListener = listener
    }

    fun start(outputPath: String): Boolean {
        if (isCapturing.get()) {
            Log.w(TAG, "Already capturing")
            return false
        }

        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize
            )

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord failed to initialize")
                releaseAudioRecord()
                return false
            }

            outputFile = File(outputPath)
            fileOutputStream = FileOutputStream(outputFile)
            
            if (outputPath.endsWith(".wav", ignoreCase = true)) {
                writeWavHeader(fileOutputStream!!, sampleRate, 1, 16)
            }
            
            totalBytesWritten = 0
            isCapturing.set(true)
            isPaused.set(false)

            audioRecord?.startRecording()
            startCaptureThread()
            
            chunkListener?.onCaptureStarted()
            Log.d(TAG, "Capture started: $outputPath")
            return true

        } catch (e: Exception) {
            Log.e(TAG, "Failed to start capture", e)
            chunkListener?.onError("Failed to start: ${e.message}")
            release()
            return false
        }
    }

    fun stop(): String? {
        if (!isCapturing.get()) {
            Log.w(TAG, "Not capturing")
            return null
        }

        Log.d(TAG, "Stopping capture...")
        isCapturing.set(false)

        try {
            captureThread?.join(2000)
        } catch (e: InterruptedException) {
            Log.w(TAG, "Interrupted while waiting for capture thread")
        }

        try {
            audioRecord?.stop()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping AudioRecord", e)
        }

        val path = outputFile?.absolutePath
        
        if (path?.endsWith(".wav", ignoreCase = true) == true) {
            updateWavHeader(path, totalBytesWritten)
        }

        closeFileStream()
        releaseAudioRecord()
        
        chunkListener?.onCaptureStopped()
        Log.d(TAG, "Capture stopped: $path, bytes written: $totalBytesWritten")
        
        return path
    }

    fun pause() {
        if (isCapturing.get() && !isPaused.get()) {
            isPaused.set(true)
            Log.d(TAG, "Capture paused")
        }
    }

    fun resume() {
        if (isCapturing.get() && isPaused.get()) {
            isPaused.set(false)
            Log.d(TAG, "Capture resumed")
        }
    }

    fun release() {
        if (isCapturing.get()) {
            stop()
        }
        releaseAudioRecord()
        closeFileStream()
        chunkListener = null
        Log.d(TAG, "Resources released")
    }

    private fun startCaptureThread() {
        captureThread = thread(name = "AudioCaptureThread", priority = Thread.MAX_PRIORITY) {
            android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO)
            
            val buffer = ByteArray(bufferSize)
            
            Log.d(TAG, "Capture thread started, buffer size: $bufferSize")
            
            while (isCapturing.get()) {
                if (isPaused.get()) {
                    Thread.sleep(50)
                    continue
                }

                val bytesRead = audioRecord?.read(buffer, 0, buffer.size) ?: -1

                when {
                    bytesRead > 0 -> {
                        val chunk = buffer.copyOf(bytesRead)
                        
                        writeToFile(chunk, bytesRead)
                        
                        chunkListener?.onAudioChunkReady(chunk, bytesRead)
                    }
                    bytesRead == AudioRecord.ERROR_INVALID_OPERATION -> {
                        Log.e(TAG, "ERROR_INVALID_OPERATION")
                        chunkListener?.onError("Invalid operation")
                        break
                    }
                    bytesRead == AudioRecord.ERROR_BAD_VALUE -> {
                        Log.e(TAG, "ERROR_BAD_VALUE")
                        chunkListener?.onError("Bad value")
                        break
                    }
                    bytesRead == AudioRecord.ERROR_DEAD_OBJECT -> {
                        Log.e(TAG, "ERROR_DEAD_OBJECT")
                        chunkListener?.onError("Dead object")
                        break
                    }
                }
            }
            
            Log.d(TAG, "Capture thread ended")
        }
    }

    @Synchronized
    private fun writeToFile(data: ByteArray, length: Int) {
        try {
            fileOutputStream?.write(data, 0, length)
            totalBytesWritten += length
        } catch (e: Exception) {
            Log.e(TAG, "Error writing to file", e)
        }
    }

    private fun writeWavHeader(out: FileOutputStream, sampleRate: Int, channels: Int, bitsPerSample: Int) {
        val byteRate = sampleRate * channels * bitsPerSample / 8
        val blockAlign = channels * bitsPerSample / 8

        val header = ByteArray(44)
        
        header[0] = 'R'.code.toByte()
        header[1] = 'I'.code.toByte()
        header[2] = 'F'.code.toByte()
        header[3] = 'F'.code.toByte()
        
        header[4] = 0
        header[5] = 0
        header[6] = 0
        header[7] = 0
        
        header[8] = 'W'.code.toByte()
        header[9] = 'A'.code.toByte()
        header[10] = 'V'.code.toByte()
        header[11] = 'E'.code.toByte()
        
        header[12] = 'f'.code.toByte()
        header[13] = 'm'.code.toByte()
        header[14] = 't'.code.toByte()
        header[15] = ' '.code.toByte()
        
        header[16] = 16
        header[17] = 0
        header[18] = 0
        header[19] = 0
        
        header[20] = 1
        header[21] = 0
        
        header[22] = channels.toByte()
        header[23] = 0
        
        header[24] = (sampleRate and 0xff).toByte()
        header[25] = ((sampleRate shr 8) and 0xff).toByte()
        header[26] = ((sampleRate shr 16) and 0xff).toByte()
        header[27] = ((sampleRate shr 24) and 0xff).toByte()
        
        header[28] = (byteRate and 0xff).toByte()
        header[29] = ((byteRate shr 8) and 0xff).toByte()
        header[30] = ((byteRate shr 16) and 0xff).toByte()
        header[31] = ((byteRate shr 24) and 0xff).toByte()
        
        header[32] = blockAlign.toByte()
        header[33] = 0
        
        header[34] = bitsPerSample.toByte()
        header[35] = 0
        
        header[36] = 'd'.code.toByte()
        header[37] = 'a'.code.toByte()
        header[38] = 't'.code.toByte()
        header[39] = 'a'.code.toByte()
        
        header[40] = 0
        header[41] = 0
        header[42] = 0
        header[43] = 0

        out.write(header)
    }

    private fun updateWavHeader(filePath: String, totalAudioBytes: Long) {
        try {
            RandomAccessFile(filePath, "rw").use { raf ->
                val fileSize = raf.length()
                
                raf.seek(4)
                writeIntLE(raf, (fileSize - 8).toInt())
                
                raf.seek(40)
                writeIntLE(raf, totalAudioBytes.toInt())
            }
            Log.d(TAG, "WAV header updated: $totalAudioBytes bytes")
        } catch (e: Exception) {
            Log.e(TAG, "Error updating WAV header", e)
        }
    }

    private fun writeIntLE(raf: RandomAccessFile, value: Int) {
        raf.write(value and 0xff)
        raf.write((value shr 8) and 0xff)
        raf.write((value shr 16) and 0xff)
        raf.write((value shr 24) and 0xff)
    }

    private fun releaseAudioRecord() {
        try {
            audioRecord?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing AudioRecord", e)
        }
        audioRecord = null
    }

    private fun closeFileStream() {
        try {
            fileOutputStream?.flush()
            fileOutputStream?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error closing file stream", e)
        }
        fileOutputStream = null
    }
}
