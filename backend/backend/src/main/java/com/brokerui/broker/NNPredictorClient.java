package com.brokerui.broker;

import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import java.util.HashMap;
import java.util.Map;
import java.util.List;

/**
 * Client service connecting to the external Neural Network python server (port 3005).
 * Sends feature arrays to get execution routing recommendations.
 */
@Service
public class NNPredictorClient {
    private final RestTemplate restTemplate = new RestTemplate();
    private final String predictUrl = "http://localhost:3005/predict";

    /**
     * Posts a feature array to the NN model server and returns prediction metrics.
     * The goal is to obtain routing recommendation labels (e.g. INTERNAL, EXTERNAL).
     *
     * @param features array of double values representing model inputs
     * @return map containing matchProb, expectedSavings, and routeRecommendation, or null if query fails
     */
    public Map<String, Object> getPrediction(double[] features) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("features", features);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            Map response = restTemplate.postForObject(predictUrl, entity, Map.class);
            
            if (response != null && response.containsKey("prediction")) {
                Object pred = response.get("prediction");
                if (pred instanceof List) {
                    List<?> list = (List<?>) pred;
                    if (list.size() >= 3) {
                        Map<String, Object> result = new HashMap<>();
                        result.put("matchProb", list.get(0));
                        result.put("expectedSavings", list.get(1));
                        result.put("routeRecommendation", list.get(2));
                        return result;
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("Failed to fetch prediction from NN server: " + e.getMessage());
        }
        return null;
    }
}
