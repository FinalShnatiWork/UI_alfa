import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MavenWrapperDownloader {
  private static final String WRAPPER_VERSION = "3.3.2";
  private static final String DEFAULT_DOWNLOAD_URL =
      "https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/"
          + WRAPPER_VERSION + "/maven-wrapper-" + WRAPPER_VERSION + ".jar";

  public static void main(String[] args) throws Exception {
    if (args.length < 1) {
      System.err.println("Base directory required");
      System.exit(1);
    }
    File baseDir = new File(args[0]);
    File wrapperJar = new File(baseDir, ".mvn/wrapper/maven-wrapper.jar");
    if (wrapperJar.isFile()) return;
    wrapperJar.getParentFile().mkdirs();
    download(DEFAULT_DOWNLOAD_URL, wrapperJar);
  }

  private static void download(String url, File dest) throws IOException {
    HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
    conn.setConnectTimeout(15000);
    conn.setReadTimeout(15000);
    conn.setInstanceFollowRedirects(true);
    try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(dest)) {
      byte[] buf = new byte[8192];
      int r;
      while ((r = in.read(buf)) != -1) out.write(buf, 0, r);
    }
  }
}

