package io.github.calllab.lockscreen;
import android.content.*;
public final class TestReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        String a=i.getAction();
        if(CallService.ARM.equals(a)||CallService.RING.equals(a)||CallService.DIRECT.equals(a)) {
            if(CallService.ARM.equals(a)) c.getSharedPreferences("calllab",Context.MODE_PRIVATE)
                .edit().putBoolean("armed",true).apply();
            CallService.start(c,a);
        }
    }
}
