# PHASE 0 SPIKE: Spring Boot web runner as a Lambda container image.
FROM maven:3.9-eclipse-temurin-21 AS libs
WORKDIR /libs
COPY libs ./
RUN for set in core jpa security; do mvn -q -B -f $set.xml dependency:copy-dependencies -DoutputDirectory=/opt/lib/$set -DincludeScope=runtime || exit 1; done
FROM eclipse-temurin:21-jdk-noble AS jdk
FROM public.ecr.aws/lambda/nodejs:22@sha256:42246b73ef598cf22bdb44e136cf21ff72f283426ba1b2da695f19293cf744d6
RUN microdnf -y install util-linux tar findutils && microdnf clean all
COPY --from=jdk /opt/java/openjdk /opt/java/openjdk
COPY --from=libs /opt/lib /opt/lib
ENV JAVA_HOME=/opt/java/openjdk \
    PATH=/opt/java/openjdk/bin:/var/lang/bin:/usr/local/bin:/usr/bin:/bin \
    PRACSTACK_NPROC=512 PRACSTACK_MAX_RSS_MB=3300
COPY run.sh bootstrap.mjs probe.mjs entrypoint.sh /opt/pracstack/
RUN chmod 0555 /opt/pracstack/*.sh && chmod 0444 /opt/pracstack/*.mjs
ENTRYPOINT ["/opt/pracstack/entrypoint.sh"]
