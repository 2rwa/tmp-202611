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
    private Button arm, stop;

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
        arm = new Button(this);
        arm.setText("Enable standby");
        arm.setOnClickListener(v -> {
            if (((KeyguardManager)getSystemService(KEYGUARD_SERVICE)).isDeviceLocked()) return;
            getSharedPreferences("calllab", MODE_PRIVATE).edit().putBoolean("armed", true).apply();
            CallService.start(this, CallService.ARM);
            refresh();
        });
        root.addView(arm, new LinearLayout.LayoutParams(-1, dp(52)));
        stop = new Button(this);
        stop.setText("Disable standby");
        stop.setOnClickListener(v -> {
            if (((KeyguardManager)getSystemService(KEYGUARD_SERVICE)).isDeviceLocked()) return;
            getSharedPreferences("calllab", MODE_PRIVATE).edit().putBoolean("armed", false).apply();
            stopService(new Intent(this, CallService.class));
            refresh();
        });
        root.addView(stop, new LinearLayout.LayoutParams(-1, dp(52)));
        Button close = new Button(this);
        close.setText("Close");
        close.setOnClickListener(v -> { CallService.clearRing(this); finish(); });
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
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        refresh();
    }

    private void refresh() {
        KeyguardManager keyguard = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        String action = getIntent().getAction();
        arm.setVisibility(keyguard.isDeviceLocked()? android.view.View.GONE : android.view.View.VISIBLE);
        stop.setVisibility(keyguard.isDeviceLocked()? android.view.View.GONE : android.view.View.VISIBLE);
        android.util.Log.i("CallLab", "activity action=" + action + " locked=" + keyguard.isDeviceLocked()
            + " secure=" + keyguard.isKeyguardSecure() + " keyguard=" + keyguard.isKeyguardLocked());
        status.setText("Keyguard showing: " + keyguard.isKeyguardLocked()
            + "\nDevice locked: " + keyguard.isDeviceLocked()
            + "\nSecure lock configured: " + keyguard.isKeyguardSecure()
            + "\nLaunch: " + ("android.media.action.STILL_IMAGE_CAMERA_SECURE".equals(action)
                ? "Secure camera intent" : CallService.RING.equals(action) ? "Incoming call" : "Normal")
            + "\nStandby: " + getSharedPreferences("calllab", MODE_PRIVATE).getBoolean("armed", false)
            + "\nTCP control: local only. No media capture.");
    }

    private int dp(int n) {
        return Math.round(n * getResources().getDisplayMetrics().density);
    }
}
