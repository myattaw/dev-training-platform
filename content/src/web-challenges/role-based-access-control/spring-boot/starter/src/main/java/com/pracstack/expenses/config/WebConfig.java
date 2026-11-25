package com.pracstack.expenses.config;

import com.pracstack.expenses.security.BearerTokenInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final BearerTokenInterceptor bearerTokens;

    public WebConfig(BearerTokenInterceptor bearerTokens) {
        this.bearerTokens = bearerTokens;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // Every API endpoint except the public health check.
        registry.addInterceptor(bearerTokens)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/health");
    }
}
