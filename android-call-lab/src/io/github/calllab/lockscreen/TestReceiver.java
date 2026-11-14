package io.github.calllab.lockscreen;
import android.content.*;
public final class TestReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        String a=i.getAction();
        if(CallService.SET_BIND.equals(a)) {
            String host=i.getStringExtra("host");
            try {
                if(host==null||!host.matches("[0-9.]{7,15}"))return;
                java.net.InetAddress addr=java.net.InetAddress.getByName(host);
                if(!(addr instanceof java.net.Inet4Address)||(!addr.isLoopbackAddress()&&!addr.isSiteLocalAddress()))return;
                c.getSharedPreferences("calllab",Context.MODE_PRIVATE).edit().putString("tcp_bind",host).apply();
                if(c.getSharedPreferences("calllab",Context.MODE_PRIVATE).getBoolean("armed",false))CallService.start(c,CallService.REBIND);
            } catch(java.io.IOException ignored){}
            return;
        }
        if(CallService.SET_TOKEN.equals(a)) {
            String token=i.getStringExtra("token");
            if(token!=null && token.matches("[0-9a-f]{64}")) c.getSharedPreferences("calllab",Context.MODE_PRIVATE).edit().putString("tcp_token",token).apply();
            return;
        }
        if(CallService.ARM.equals(a)||CallService.RING.equals(a)||CallService.DIRECT.equals(a)) {
            if(CallService.ARM.equals(a)) c.getSharedPreferences("calllab",Context.MODE_PRIVATE)
                .edit().putBoolean("armed",true).apply();
            CallService.start(c,a);
        }
    }
}
