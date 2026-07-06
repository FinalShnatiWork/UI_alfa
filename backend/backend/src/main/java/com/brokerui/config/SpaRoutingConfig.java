package com.brokerui.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

/**
 * MVC Configuration for SPA (Single Page Application) routing.
 * Ensures that requests for frontend paths resolve correctly to index.html.
 */
@Configuration
public class SpaRoutingConfig implements WebMvcConfigurer {

  /**
   * Sets up handlers to resolve static resources, falling back to index.html if resource is not found.
   * This facilitates HTML5 history API navigation routing.
   *
   * @param registry resource handlers registry helper
   */
  @Override
  public void addResourceHandlers(ResourceHandlerRegistry registry) {
    registry
        .addResourceHandler("/**")
        .addResourceLocations("classpath:/static/")
        .resourceChain(true)
        .addResolver(new PathResourceResolver() {
          /**
           * Resolves requested resource location path. Fallback to static index.html.
           *
           * @param resourcePath the relative resource file path
           * @param location the base resource directory location
           * @return resolved Resource object
           * @throws IOException if file access fails
           */
          @Override
          protected Resource getResource(String resourcePath, Resource location) throws IOException {
            Resource requested = location.createRelative(resourcePath);
            // Serve existing static files directly, otherwise fall back to index.html for SPA routing
            if (requested.exists() && requested.isReadable()) {
              return requested;
            }
            return new ClassPathResource("/static/index.html");
          }

          /**
           * Resolves resource from request path and list of locations.
           *
           * @param request current http servlet request
           * @param requestPath the path of resource requested
           * @param locations candidate static directory resource locations
           * @param chain the resource resolver chain to proceed with
           * @return resolved Resource object
           */
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
