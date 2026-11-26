# Spring Boot web runner function (AWS Lambda container image). Built from
# services/runners/dist/web-spring-boot (see src/web-handler.ts). A fixed,
# pinned class path: no Maven at run time.
#
# Pinned like the local image (packages/web-runner/docker/spring-boot): Temurin
# JDK 21; Spring Boot 4.1.3 library sets core, jpa and security (libs/*.xml).
FROM maven:3.9-eclipse-temurin-21 AS libs
WORKDIR /libs
COPY libs ./
RUN for set in core jpa security; do \
      mvn -q -B -f $set.xml dependency:copy-dependencies -DoutputDirectory=/opt/lib/$set -DincludeScope=runtime || exit 1; \
    done

FROM eclipse-temurin:21-jdk-noble AS jdk

FROM public.ecr.aws/lambda/nodejs:22@sha256:42246b73ef598cf22bdb44e136cf21ff72f283426ba1b2da695f19293cf744d6
RUN microdnf -y install util-linux tar findutils && microdnf clean all
COPY --from=jdk /opt/java/openjdk /opt/java/openjdk
COPY --from=libs /opt/lib /opt/lib
ENV WEB_FRAMEWORK=spring-boot
COPY run.sh /opt/pracstack/run.sh
COPY handler.mjs ${LAMBDA_TASK_ROOT}/
COPY web-entrypoint.sh /opt/pracstack/entrypoint.sh
RUN chmod 0555 /opt/pracstack/run.sh /opt/pracstack/entrypoint.sh
ENTRYPOINT ["/opt/pracstack/entrypoint.sh"]
CMD ["handler.handler"]
