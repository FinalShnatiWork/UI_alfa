package com.brokerui.market;

import java.net.http.HttpClient;
import java.security.KeyStore;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

/**
 * HTTPS client for the price feeds. A certificate is accepted when Java's own list trusts it
 * or, on Windows, when the Windows certificate store trusts it. The Windows store is needed
 * where an antivirus re-signs HTTPS traffic with its own root that only Windows knows.
 */
final class FeedHttpClient {
    private FeedHttpClient() {}

    static HttpClient create() {
        HttpClient.Builder builder = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.ALWAYS);
        try {
            List<X509TrustManager> managers = new ArrayList<>();
            managers.add(managerFor(null));
            if (System.getProperty("os.name", "").toLowerCase().contains("win")) {
                KeyStore windows = KeyStore.getInstance("Windows-ROOT");
                windows.load(null, null);
                managers.add(managerFor(windows));
            }
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, new TrustManager[] { new AnyOf(managers) }, null);
            builder.sslContext(ctx);
        } catch (Exception e) {
            System.err.println("[Feeds] Windows certificate store unavailable, using Java defaults: " + e.getMessage());
        }
        return builder.build();
    }

    private static X509TrustManager managerFor(KeyStore store) throws Exception {
        TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(store);
        for (TrustManager tm : tmf.getTrustManagers()) {
            if (tm instanceof X509TrustManager x) return x;
        }
        throw new IllegalStateException("no X509 trust manager");
    }

    /** Trusts a server chain when at least one of the lists does; every list still checks it fully. */
    private record AnyOf(List<X509TrustManager> managers) implements X509TrustManager {
        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            CertificateException last = null;
            for (X509TrustManager m : managers) {
                try {
                    m.checkServerTrusted(chain, authType);
                    return;
                } catch (CertificateException e) {
                    last = e;
                }
            }
            throw last != null ? last : new CertificateException("no trust manager");
        }

        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            managers.get(0).checkClientTrusted(chain, authType);
        }

        @Override
        public X509Certificate[] getAcceptedIssuers() {
            return managers.stream().flatMap(m -> java.util.Arrays.stream(m.getAcceptedIssuers()))
                    .toArray(X509Certificate[]::new);
        }
    }
}
