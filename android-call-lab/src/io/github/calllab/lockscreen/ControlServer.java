package io.github.calllab.lockscreen;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.PowerManager;
import android.util.Log;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Loopback-only prototype. Do not expose the plaintext token protocol on LAN. */
final class ControlServer implements Closeable {
    static final int PORT=18765;
    private final Context context;
    private final Runnable ring;
    private volatile boolean running;
    private volatile ServerSocket listener;
    private volatile Socket client;
    private long lastRing;
    ControlServer(Context c,Runnable r){context=c;ring=r;}
    void start(){
        running=true;
        Thread t=new Thread(this::serve,"CallLab-control");
        t.setDaemon(true);
        t.start();
    }
    private void serve(){
        try(ServerSocket ss=new ServerSocket()){
            listener=ss;
            ss.setReuseAddress(true);
            ss.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"),PORT),8);
            if(!running)return;
            Log.i("CallLab","TCP listening loopback:"+PORT);
            while(running){
                try(Socket s=ss.accept()){
                    client=s;
                    if(!running)break;
                    s.setSoTimeout(2000);
                    String line=readLine(s.getInputStream());
                    String reply=handle(line);
                    s.getOutputStream().write((reply+"\n").getBytes(StandardCharsets.US_ASCII));
                    s.getOutputStream().flush();
                }catch(IOException e){if(running)Log.w("CallLab","TCP client closed or timed out");}
                finally{client=null;}
            }
        }catch(IOException e){if(running)Log.e("CallLab","TCP listener failed",e);}
        finally{listener=null;}
    }
    private String readLine(InputStream in)throws IOException{
        ByteArrayOutputStream b=new ByteArrayOutputStream();
        for(int n=0;n<256;n++){
            int v=in.read();
            if(v==-1||v==10)return new String(b.toByteArray(),StandardCharsets.US_ASCII).trim();
            if(v<32||v>126){if(v!=13)return ""; }
            else b.write(v);
        }
        return "";
    }
    private String handle(String line){
        if("PING".equals(line)){
            KeyguardManager k=(KeyguardManager)context.getSystemService(Context.KEYGUARD_SERVICE);
            PowerManager p=(PowerManager)context.getSystemService(Context.POWER_SERVICE);
            return "PONG locked="+k.isDeviceLocked()+" interactive="+p.isInteractive();
        }
        if(!line.startsWith("RING "))return "ERR command";
        String configured=context.getSharedPreferences("calllab",Context.MODE_PRIVATE).getString("tcp_token","");
        String received=line.substring(5);
        if(configured.length()!=64||received.length()!=64||!MessageDigest.isEqual(configured.getBytes(StandardCharsets.US_ASCII),received.getBytes(StandardCharsets.US_ASCII)))return "ERR auth";
        long now=android.os.SystemClock.elapsedRealtime();
        if(lastRing!=0&&now-lastRing<5000)return "ERR rate";
        lastRing=now;
        ring.run();
        return "OK queued";
    }
    @Override public void close(){
        running=false;
        try{if(listener!=null)listener.close();}catch(IOException ignored){}
        try{if(client!=null)client.close();}catch(IOException ignored){}
    }
}
