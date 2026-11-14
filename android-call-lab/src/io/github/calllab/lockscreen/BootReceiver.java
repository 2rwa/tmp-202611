package io.github.calllab.lockscreen;
import android.content.*;
public final class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c,Intent i) {
        if(Intent.ACTION_BOOT_COMPLETED.equals(i.getAction()) &&
           c.getSharedPreferences("calllab",Context.MODE_PRIVATE).getBoolean("armed",false))
            CallService.start(c,CallService.ARM);
    }
}
