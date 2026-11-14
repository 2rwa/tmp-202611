package io.github.calllab.lockscreen;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class CallActivity extends Activity {
    private TextView status;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
            | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        // This activity must never dismiss the keyguard or expose private data.
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(24), dp(24), dp(24), dp(24));
        root.setBackgroundColor(Color.rgb(16, 27, 39));
        TextView title = new TextView(this);
        title.setText("Call Lab");
        title.setTextSize(32);
        title.setTextColor(Color.WHITE);
        title.setGravity(Gravity.CENTER);
        root.addView(title);
        status = new TextView(this);
        status.setTextSize(19);
        status.setTextColor(Color.LTGRAY);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, dp(20), 0, dp(20));
        root.addView(status);
        Button test = new Button(this);
        test.setText("Check lock state");
        test.setOnClickListener(v -> refresh());
        root.addView(test, new LinearLayout.LayoutParams(-1, dp(64)));
        Button close = new Button(this);
        close.setText("Close");
        close.setOnClickListener(v -> finish());
        root.addView(close, new LinearLayout.LayoutParams(-1, dp(64)));
        setContentView(root);
    }

    @Override protected void onResume() {
        super.onResume();
        refresh();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        refresh();
    }

    private void refresh() {
        KeyguardManager keyguard = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        String action = getIntent().getAction();
        status.setText("Keyguard showing: " + keyguard.isKeyguardLocked()
            + "\nDevice locked: " + keyguard.isDeviceLocked()
            + "\nSecure lock configured: " + keyguard.isDeviceSecure()
            + "\nLaunch: " + ("android.media.action.STILL_IMAGE_CAMERA_SECURE".equals(action)
                ? "Secure camera intent" : "Normal")
            + "\nNo camera, microphone, or network access in this build.");
    }

    private int dp(int n) {
        return Math.round(n * getResources().getDisplayMetrics().density);
    }
}
