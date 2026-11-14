package io.github.calllab.lockscreen;

import android.app.*;
import android.content.*;
import android.media.session.*;
import android.os.*;
import android.view.KeyEvent;
import android.util.Log;

public final class CallService extends Service {
    static final String ARM="io.github.calllab.ARM", RING="io.github.calllab.RING",
        DIRECT="io.github.calllab.DIRECT", SET_TOKEN="io.github.calllab.SET_TOKEN", SET_BIND="io.github.calllab.SET_BIND", REBIND="io.github.calllab.REBIND";
    private static final int STANDBY_ID=101, RING_ID=102;
    private MediaSession session;
    private long lastRing;
    private NotificationManager manager;
    private ControlServer control;
    private PowerManager.WakeLock cpuLock;
    private android.net.wifi.WifiManager.WifiLock wifiLock;
    private final Handler main = new Handler(Looper.getMainLooper());
    static void start(Context c, String action) {
        Intent i=new Intent(c,CallService.class).setAction(action);
        if(Build.VERSION.SDK_INT>=26) c.startForegroundService(i); else c.startService(i);
    }
    static void clearRing(Context c) {
        ((NotificationManager)c.getSystemService(NOTIFICATION_SERVICE)).cancel(RING_ID);
    }
    @Override public void onCreate() {
        super.onCreate();
        manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26) {
            manager.createNotificationChannel(new NotificationChannel("standby","Call Lab standby",NotificationManager.IMPORTANCE_LOW));
            manager.createNotificationChannel(new NotificationChannel("ring","Call Lab incoming",NotificationManager.IMPORTANCE_HIGH));
        }
        session=new MediaSession(this,"Call Lab");
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS|MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setPlaybackState(new PlaybackState.Builder().setActions(PlaybackState.ACTION_PLAY|PlaybackState.ACTION_PLAY_PAUSE|PlaybackState.ACTION_PAUSE).setState(PlaybackState.STATE_PAUSED,0,0).build());
        session.setCallback(new MediaSession.Callback(){
            @Override public boolean onMediaButtonEvent(Intent i) {
                KeyEvent k=i.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
                if(k==null) return false;
                int code=k.getKeyCode();
                if(code!=KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE && code!=KeyEvent.KEYCODE_MEDIA_PLAY
                    && code!=KeyEvent.KEYCODE_HEADSETHOOK && code!=KeyEvent.KEYCODE_MEDIA_PAUSE) return false;
                if(k.getAction()==KeyEvent.ACTION_DOWN && k.getRepeatCount()==0) ring(false,"media-key");
                return true;
            }
            @Override public void onPlay(){ring(false,"media-play");}
        });
        session.setActive(true);
        Log.i("CallLab","service created; media session active");
    }
    private Notification.Builder builder(String channel) {
        return Build.VERSION.SDK_INT>=26 ? new Notification.Builder(this,channel) : new Notification.Builder(this);
    }
    private PendingIntent activity(String action,int request) {
        return PendingIntent.getActivity(this,request,new Intent(this,CallActivity.class).setAction(action)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    @Override public int onStartCommand(Intent intent,int flags,int id) {
        startForeground(STANDBY_ID,builder("standby").setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Call Lab standby").setContentText("Waiting for a test call")
            .setContentIntent(activity(ARM,101)).setOngoing(true).build());
        String action=intent==null?ARM:intent.getAction();
        if (!getSharedPreferences("calllab", MODE_PRIVATE).getBoolean("armed", false)) { stopSelf(); return START_NOT_STICKY; }
        if(cpuLock==null){
            PowerManager pm=(PowerManager)getSystemService(POWER_SERVICE);
            cpuLock=pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"CallLab:standby");cpuLock.acquire();
            android.net.wifi.WifiManager wifi=(android.net.wifi.WifiManager)getApplicationContext().getSystemService(WIFI_SERVICE);
            if(wifi!=null){wifiLock=wifi.createWifiLock(android.net.wifi.WifiManager.WIFI_MODE_FULL,"CallLab:standby");wifiLock.acquire();}
        }
        if(REBIND.equals(action)&&control!=null){control.close();control=null;}
        if (control==null) { control=new ControlServer(this, () -> main.post(() -> ring(true,"tcp"))); control.start(); }
        if(RING.equals(action)||DIRECT.equals(action)) ring(DIRECT.equals(action),"diagnostic");
        return START_STICKY;
    }
    private void ring(boolean direct,String source) {
        long now=SystemClock.elapsedRealtime();
        if(lastRing!=0 && now-lastRing<1500) return;
        lastRing=now;
        Log.i("CallLab","ring source="+source+" direct="+direct);
        if(direct) {
            // Legacy Android: an existing singleTop Activity may not wake the display.
            PowerManager pm=(PowerManager)getSystemService(POWER_SERVICE);
            PowerManager.WakeLock wake=pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP, "CallLab:ring");
            wake.acquire(5000);
            startActivity(new Intent(this,CallActivity.class).setAction(RING)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP));
            return;
        }
        PendingIntent p=activity(RING,102);
        manager.notify(RING_ID,builder("ring").setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Incoming test call").setContentText("Open Call Lab")
            .setCategory(Notification.CATEGORY_CALL).setPriority(Notification.PRIORITY_MAX)
            .setVisibility(Notification.VISIBILITY_PUBLIC).setFullScreenIntent(p,true)
            .setContentIntent(p).setAutoCancel(true).build());
    }
    @Override public void onDestroy() {
        clearRing(this);
        if(control!=null) { control.close(); control=null; }
        if(wifiLock!=null&&wifiLock.isHeld())wifiLock.release();
        if(cpuLock!=null&&cpuLock.isHeld())cpuLock.release();
        session.release();
        stopForeground(true);
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent i){return null;}
}
