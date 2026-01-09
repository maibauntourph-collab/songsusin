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
import java.io.File

class ConcurrentCaptureExample : AppCompatActivity(), AudioChunkListener {

    companion object {
        private const val TAG = "ConcurrentCaptureExample"
        private const val PERMISSION_REQUEST_CODE = 1002
    }

    private lateinit var capturer: ConcurrentAudioCapturer
    private lateinit var btnCapture: Button
    private lateinit var tvStatus: TextView
    private lateinit var tvChunkInfo: TextView
    private lateinit var tvTranscript: TextView

    private var chunkCount = 0
    private var totalBytes = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_concurrent_capture)

        initViews()

        if (checkPermission()) {
            initCapturer()
        } else {
            requestPermission()
        }
    }

    private fun initViews() {
        btnCapture = findViewById(R.id.btn_capture)
        tvStatus = findViewById(R.id.tv_status)
        tvChunkInfo = findViewById(R.id.tv_chunk_info)
        tvTranscript = findViewById(R.id.tv_transcript)

        btnCapture.setOnClickListener {
            if (capturer.isRunning) {
                stopCapture()
            } else {
                startCapture()
            }
        }
    }

    private fun initCapturer() {
        capturer = ConcurrentAudioCapturer(
            sampleRate = 16000,
        )
        capturer.setChunkListener(this)
        updateUI()
    }

    private fun startCapture() {
        val outputPath = File(getExternalFilesDir(null), "capture_${System.currentTimeMillis()}.wav").absolutePath
        
        chunkCount = 0
        totalBytes = 0

        if (capturer.start(outputPath)) {
            Toast.makeText(this, "Capturing...", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "Failed to start", Toast.LENGTH_SHORT).show()
        }
        updateUI()
    }

    private fun stopCapture() {
        val path = capturer.stop()
        Toast.makeText(this, "Saved: $path", Toast.LENGTH_LONG).show()
        updateUI()
    }

    private fun updateUI() {
        runOnUiThread {
            val isRunning = capturer.isRunning
            tvStatus.text = if (isRunning) "Status: CAPTURING" else "Status: IDLE"
            btnCapture.text = if (isRunning) "Stop Capture" else "Start Capture"
        }
    }

    override fun onAudioChunkReady(bytes: ByteArray, bytesRead: Int) {
        chunkCount++
        totalBytes += bytesRead

        runOnUiThread {
            tvChunkInfo.text = "Chunks: $chunkCount | Bytes: $totalBytes"
        }

        processForSTT(bytes, bytesRead)
    }

    private fun processForSTT(bytes: ByteArray, bytesRead: Int) {
        runOnUiThread {
            tvTranscript.text = "[Chunk #$chunkCount] $bytesRead bytes ready for STT\n(Connect your streaming STT service here)"
        }
    }

    override fun onCaptureStarted() {
        Log.d(TAG, "Capture started")
        runOnUiThread {
            tvTranscript.text = "Capture started. Speak now..."
        }
    }

    override fun onCaptureStopped() {
        Log.d(TAG, "Capture stopped")
    }

    override fun onError(error: String) {
        Log.e(TAG, "Error: $error")
        runOnUiThread {
            Toast.makeText(this, "Error: $error", Toast.LENGTH_SHORT).show()
        }
    }

    private fun checkPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this, Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestPermission() {
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.RECORD_AUDIO),
            PERMISSION_REQUEST_CODE
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                initCapturer()
            } else {
                Toast.makeText(this, "Permission required", Toast.LENGTH_LONG).show()
                finish()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::capturer.isInitialized) {
            capturer.release()
        }
    }
}
