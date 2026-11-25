package com.pracstack.expenses.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Authenticates requests from their {@code Authorization: Bearer <token>} header.
 * Registered in WebConfig for /api/** except /api/health. Anything but a known
 * token is 401 with {@code WWW-Authenticate: Bearer}.
 */
@Component
public class BearerTokenInterceptor implements HandlerInterceptor {
    private final IdentityStore identities;

    public BearerTokenInterceptor(IdentityStore identities) {
        this.identities = identities;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        Optional<AppUser> user = authenticate(request.getHeader(HttpHeaders.AUTHORIZATION));
        if (user.isEmpty()) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"error\":\"A valid bearer token is required.\"}");
            return false;
        }
        request.setAttribute(AppUser.REQUEST_ATTRIBUTE, user.get());
        return true;
    }

    /** "<scheme> <token>": the scheme is case-insensitive, the token is not. */
    private Optional<AppUser> authenticate(String header) {
        if (header == null) return Optional.empty();
        int space = header.indexOf(' ');
        if (space <= 0) return Optional.empty();
        String scheme = header.substring(0, space);
        String token = header.substring(space + 1).trim();
        if (!scheme.equals("Bearer") || token.isEmpty()) return Optional.empty();
        return identities.findByToken(token);
    }
}
