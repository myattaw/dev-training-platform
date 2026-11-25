package com.pracstack.expenses.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Authenticates requests from their {@code Authorization: Bearer <token>} header.
 * Registered in WebConfig for /api/** except /api/health.
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
        // TODO: require a valid bearer token.
        // - Read the Authorization header: the scheme "Bearer" (any letter case),
        //   one space, then the token (case-sensitive). Look the token up in `identities`.
        // - Missing header, another scheme, no token or an unknown token:
        //   401 Unauthorized with the header `WWW-Authenticate: Bearer`, and stop (return false).
        // - Otherwise store the user: request.setAttribute(AppUser.REQUEST_ATTRIBUTE, user).
        return true;
    }
}
