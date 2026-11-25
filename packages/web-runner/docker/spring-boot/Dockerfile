# Web-challenge runner for Spring Boot applications (UNTRUSTED code runs here).
# Built by `npm run web-runners:build`. Holds the JDK and a fixed, pinned class
# path: no secrets, no expected values, no Maven at run time, no network.
#
# Versions are pinned: Temurin JDK 21; Spring Boot 4.1.3 (see libs/*.xml). Three
# library sets: core (web MVC, validation), jpa (+ Data JPA, H2), security (+ Spring Security).
FROM maven:3.9-eclipse-temurin-21 AS libs
WORKDIR /libs
COPY libs ./
RUN for set in core jpa security; do       mvn -q -B -f $set.xml dependency:copy-dependencies -DoutputDirectory=/opt/lib/$set -DincludeScope=runtime || exit 1;     done

FROM eclipse-temurin:21-jdk-alpine
COPY --from=libs /opt/lib /opt/lib
COPY run.sh /opt/pracstack/run.sh
RUN chmod 555 /opt/pracstack/run.sh
ENV HOME=/tmp
USER 10001:10001
ENTRYPOINT ["/opt/pracstack/run.sh"]
