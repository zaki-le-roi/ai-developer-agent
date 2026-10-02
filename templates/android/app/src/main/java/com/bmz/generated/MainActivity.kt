package com.bmz.generated

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val view = TextView(this)
        view.text = "BMZ AI — تطبيق Android مولّد"
        view.textSize = 22f
        view.setPadding(48, 48, 48, 48)
        setContentView(view)
    }
}
