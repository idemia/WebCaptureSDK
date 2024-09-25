/*
Copyright 2024 IDEMIA Public Security

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
package com.example.webviewdemo

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.util.Log
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.example.webviewdemo.databinding.ActivityMainBinding
import java.io.File
import java.io.IOException


class MainActivity : AppCompatActivity() {
    companion object {
        private val TAG: String = MainActivity::class.java.simpleName
    }

    private lateinit var mWebView: WebView
    private lateinit var mSwipeRefreshLayout: SwipeRefreshLayout
    private var mFilePathCallback: ValueCallback<Array<Uri>>? = null
    private var mCameraPhotoPath: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        mWebView = binding.webView
        mSwipeRefreshLayout = binding.swipeRefreshLayout
        // Handle refresh of the page
        mSwipeRefreshLayout.setOnRefreshListener {
            mWebView.reload()
        }
        // Handle Back key press
        onBackPressedDispatcher.addCallback(this) {
            if (mWebView.canGoBack()) {
                mWebView.goBack()
            } else {
                finish()
            }
        }
        // Cleanup existing photos in cache
        deleteFiles(this@MainActivity.externalCacheDir!!.absolutePath)
        // Ensure CAMERA permission is granted
        if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            // Permission already granted, init & load wv content
            initWebView()
        } else {
            // Ask the user to grant permission
            requestPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        // Cleanup existing photos in cache
        deleteFiles(this@MainActivity.externalCacheDir!!.absolutePath)
    }

    /**
     * Register the permissions callback, which handles the user's response to the system permissions dialog
     */
    private val requestPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { isGranted: Boolean ->
            if (isGranted) {
                // Permission is granted
                initWebView()
            } else {
                Log.e(TAG, "Mandatory permission not granted")
                Toast.makeText(this, "Permission CAMERA must be granted", Toast.LENGTH_LONG).show()
            }
        }

    /**
     * Register the activity result callback which will be called after the native camera returns (in manual capture)
     */
    private val resultLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (mFilePathCallback != null) {
                var results: Array<Uri>? = null
                // Check that the response is a good one
                if (result.resultCode == RESULT_OK && mCameraPhotoPath != null) {
                    results = arrayOf(Uri.parse(mCameraPhotoPath))
                }
                mFilePathCallback!!.onReceiveValue(results)
                mFilePathCallback = null
            }
        }

    @SuppressLint("SetJavaScriptEnabled")
    private fun initWebView() {
        // Set mandatory settings
        mWebView.settings.javaScriptEnabled = true
        mWebView.settings.domStorageEnabled = true
        mWebView.settings.mediaPlaybackRequiresUserGesture = false // CRITICAL
        // Demo settings
        mWebView.settings.allowFileAccess = true
        // Use a custom chrome client to handle permission & native camera app
        mWebView.webChromeClient = MyWebChromeClient()
        // Instantiate a WebView client to avoid launching external browser during a redirection for example
        mWebView.webViewClient = MyWebViewClient()
        mWebView.loadUrl("file:///android_asset/index.html")
    }

    internal inner class MyWebViewClient : WebViewClient() {
        /**
         * Disable refresh animation after page has been reloaded
         */
        override fun onPageFinished(view: WebView?, url: String?) {
            mSwipeRefreshLayout.isRefreshing = false
        }
    }

    internal inner class MyWebChromeClient : WebChromeClient() {
        /**
         * Grant permission for auto capture
         */
        override fun onPermissionRequest(request: PermissionRequest?) {
            val requestedResources = request!!.resources
            for (r in requestedResources) {
                if (r == PermissionRequest.RESOURCE_VIDEO_CAPTURE) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                    break
                }
            }
        }

        /**
         * Override the default file chooser to launch directly the native camera and handle image returned (manual capture)
         */
        override fun onShowFileChooser(webView: WebView, filePathCallback: ValueCallback<Array<Uri>>, fileChooserParams: FileChooserParams): Boolean {
            // Ensure we don't have any existing callbacks
            if (mFilePathCallback != null) {
                mFilePathCallback!!.onReceiveValue(null)
                mFilePathCallback = null
            }
            // Create the temporary file where the photo will be saved
            val photoFile: File?
            try {
                photoFile = File.createTempFile(System.currentTimeMillis().toString(), ".jpeg", this@MainActivity.externalCacheDir)
            } catch (ex: IOException) {
                // Error occurred while creating the file
                Log.e(TAG, "Unable to create image file", ex)
                // Cancel the request
                filePathCallback.onReceiveValue(null)
                return true
            }
            // Save callback path which will be reused with the result
            mFilePathCallback = filePathCallback
            // Save photo path which will be used after the camera app returns
            mCameraPhotoPath = "file:" + photoFile.absolutePath
            // Use our defined FileProvider to build uri so that the camera app can write the photo data into
            val uri = FileProvider.getUriForFile(this@MainActivity, BuildConfig.APPLICATION_ID + ".provider", photoFile)
            val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
            intent.putExtra(MediaStore.EXTRA_OUTPUT, uri)
            resultLauncher.launch(intent)
            return true
        }
    }

    private fun deleteFiles(folder: String, ext: String = "jpeg") {
        val dir = File(folder)
        if (!dir.exists()) {
            return
        }
        val files = dir.listFiles { _, name -> name.endsWith(ext) }
        files?.forEach { file ->
            if (!file.isDirectory) {
                file.delete()
            }
        }
    }

}

