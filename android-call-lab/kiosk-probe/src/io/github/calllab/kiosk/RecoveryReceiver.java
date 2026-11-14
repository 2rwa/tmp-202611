package io.github.calllab.kiosk;
import android.content.*;
import android.util.Log;
public final class RecoveryReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c,Intent i){
        String a=i.getAction();
        if(!"io.github.calllab.kiosk.EXIT".equals(a)&&!"io.github.calllab.kiosk.RELEASE".equals(a))return;
        try{KioskActivity.recover(c,"io.github.calllab.kiosk.RELEASE".equals(a));}
        catch(RuntimeException e){Log.e("KioskProbe","recovery failed",e);}
    }
}
