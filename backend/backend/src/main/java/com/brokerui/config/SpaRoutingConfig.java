package com.brokerui.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

@Configuration
public class SpaRoutingConfig implements WebMvcConfigurer {

  @Override
  public void addResourceHandlers(ResourceHandlerRegistry registry) {
    registry
        .addResourceHandler("/**")
        .addResourceLocations("classpath:/static/")
        .resourceChain(true)
        .addResolver(new PathResourceResolver() {
          @Override
          protected Resource getResource(String resourcePath, Resource location) throws IOException {
            Resource requested = location.createRelative(resourcePath);
            // Serve existing static files directly, otherwise fall back to index.html for SPA routing
            if (requested.exists() && requested.isReadable()) {
              return requested;
            }
            return new ClassPathResource("/static/index.html");
          }

          @Override
          protected Resource resolveResourceInternal(
              HttpServletRequest request, String requestPath, java.util.List<? extends Resource> locations,
              org.springframework.web.servlet.resource.ResourceResolverChain chain) {
            Resource resolved = chain.resolveResource(request, requestPath, locations);
            if (resolved == null) {
              try {
                Resource indexHtml = new ClassPathResource("/static/index.html");
                return indexHtml.exists() ? indexHtml : null;
              } catch (Exception e) {
                return null;
              }
            }
            return resolved;
          }
        });
  }
}
