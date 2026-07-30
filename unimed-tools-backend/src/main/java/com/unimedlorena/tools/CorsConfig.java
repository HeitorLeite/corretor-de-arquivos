package com.unimedlorena.tools;

import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

@Configuration
public class CorsConfig {

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration cfg = new CorsConfiguration();

        cfg.setAllowedOriginPatterns(List.of(
            "http://localhost:4200",
            "http://localhost:3000",
            "https://corretor-de-arquivos.onrender.com",
            "https://corretor-de-arquivos.vercel.app",
            "https://*.vercel.app"
        ));

        cfg.setAllowedMethods(List.of(
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS"
        ));

        cfg.setAllowedHeaders(List.of("*"));
        cfg.setExposedHeaders(List.of(
            "X-Stats",
            "Content-Disposition"
        ));

        cfg.setAllowCredentials(false);

        UrlBasedCorsConfigurationSource source =
            new UrlBasedCorsConfigurationSource();

        source.registerCorsConfiguration("/**", cfg);

        return new CorsFilter(source);
    }
}