import type { QuestionSource } from '@pracstack/content-model';
import { yaml } from '../helpers';
import { programBuilders } from '../program-builders';

/*
 * Configuration and security. Configuration programs start real Spring Boot
 * applications (`SpringApplicationBuilder`) and bind real property sources;
 * security programs run Spring Security's filter chain in front of MockMvc.
 */

const b = programBuilders('java');

// ---------------------------------------------------------------- Configuration

const BOOT_IMPORTS = `import org.springframework.boot.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.properties.*;
import org.springframework.context.annotation.*;`;

export const configurationFamilies: readonly QuestionSource[] = [
  ...b.output(
    'sb-cfg-value',
    1,
    ['`${key:default}` uses the default only when the key is not defined anywhere.'],
    [
      {
        key: 'default-value',
        code: `${BOOT_IMPORTS}
import org.springframework.beans.factory.annotation.Value;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class, Checkout.class)
            .web(WebApplicationType.NONE)
            .properties("shop.name=Corner Shop")
            .run();
        System.out.println(ctx.getBean(Checkout.class).describe());
    }
}

@SpringBootConfiguration
class App {}

class Checkout {
    private final String shop;
    private final String currency;

    Checkout(@Value("\${shop.name}") String shop, @Value("\${shop.currency:EUR}") String currency) {
        this.shop = shop;
        this.currency = currency;
    }

    String describe() { return shop + " sells in " + currency; }
}`,
        output: 'Corner Shop sells in EUR',
        why: '`shop.name` is defined, so its value is injected. `shop.currency` is not, so the default after the colon is used. Defaults keep optional settings optional without a code change.',
      },
      {
        key: 'override-default',
        code: `${BOOT_IMPORTS}
import org.springframework.beans.factory.annotation.Value;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class, RetryPolicy.class)
            .web(WebApplicationType.NONE)
            .properties("http.retries=5")
            .run();
        System.out.println(ctx.getBean(RetryPolicy.class).describe());
    }
}

@SpringBootConfiguration
class App {}

class RetryPolicy {
    private final int retries;
    private final long backoffMs;

    RetryPolicy(@Value("\${http.retries:3}") int retries, @Value("\${http.backoff-ms:200}") long backoffMs) {
        this.retries = retries;
        this.backoffMs = backoffMs;
    }

    String describe() { return retries + " retries, " + (retries * backoffMs) + " ms total backoff"; }
}`,
        output: '5 retries, 1000 ms total backoff',
        why: 'The configured `http.retries=5` replaces the default 3, while `http.backoff-ms` falls back to 200. Values are converted to the parameter types, so the arithmetic is numeric.',
      },
    ],
  ),
  ...b.output(
    'sb-cfg-configuration-properties',
    2,
    [
      '`@ConfigurationProperties("prefix")` binds every property under the prefix to the record’s components; kebab-case keys map to camelCase names.',
    ],
    [
      {
        key: 'record-binding',
        code: `${BOOT_IMPORTS}
import java.util.List;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .properties(
                "mail.host=smtp.example.com",
                "mail.port=587",
                "mail.default-sender=noreply@example.com",
                "mail.admins[0]=ann@example.com",
                "mail.admins[1]=bob@example.com")
            .run();
        MailProperties mail = ctx.getBean(MailProperties.class);
        System.out.println(mail.host() + ":" + mail.port());
        System.out.println(mail.defaultSender());
        System.out.println(mail.admins().size());
    }
}

@SpringBootConfiguration
@EnableConfigurationProperties(MailProperties.class)
class App {}

@ConfigurationProperties("mail")
record MailProperties(String host, int port, String defaultSender, List<String> admins) {}`,
        output: 'smtp.example.com:587\nnoreply@example.com\n2',
        why: 'The record is bound through its constructor: `mail.default-sender` maps to `defaultSender` (relaxed binding), indexed keys build the list, and `587` is converted to `int`. One typed object replaces many scattered `@Value` strings.',
      },
      {
        key: 'nested-and-missing',
        code: `${BOOT_IMPORTS}

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .properties("storage.bucket=invoices", "storage.retention.days=30")
            .run();
        StorageProperties storage = ctx.getBean(StorageProperties.class);
        System.out.println(storage.bucket() + " " + storage.retention().days());
        System.out.println(storage.region());
    }
}

@SpringBootConfiguration
@EnableConfigurationProperties(StorageProperties.class)
class App {}

@ConfigurationProperties("storage")
record StorageProperties(String bucket, String region, Retention retention) {
    record Retention(int days) {}
}`,
        output: 'invoices 30\nnull',
        why: 'Nested records bind nested keys (`storage.retention.days`). A component without a property stays `null` (or the default for primitives), so required settings deserve validation with `@Validated` and constraints.',
      },
    ],
  ),
  ...b.output(
    'sb-cfg-yaml',
    2,
    ['Spring Boot flattens YAML into the same keys a properties file would use.'],
    [
      {
        key: 'flatten',
        code: `import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ByteArrayResource;
import java.util.*;

public class Main {
    public static void main(String[] args) {
        var yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ByteArrayResource("""
            server:
              port: 8081
            shop:
              regions:
                - eu
                - us
              limits:
                max-items: 50
            """.getBytes()));
        new TreeMap<>(yaml.getObject()).forEach((key, value) -> System.out.println(key + "=" + value));
    }
}`,
        output:
          'server.port=8081\nshop.limits.max-items=50\nshop.regions[0]=eu\nshop.regions[1]=us',
        why: '`YamlPropertiesFactoryBean` uses the same YAML processing as Spring Boot’s config loader: nesting becomes dotted keys and lists become indexed keys. YAML and `application.properties` are two syntaxes for the same flat key space.',
      },
      {
        key: 'yaml-surprises',
        code: `import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ByteArrayResource;
import java.util.*;

public class Main {
    public static void main(String[] args) {
        var yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ByteArrayResource("""
            shop:
              country: NO
              api-version: 1.10
              quoted-version: "1.10"
            """.getBytes()));
        new TreeMap<>(yaml.getObject()).forEach((key, value) -> System.out.println(key + "=" + value));
    }
}`,
        output: 'shop.api-version=1.1\nshop.country=false\nshop.quoted-version=1.10',
        why: 'Spring’s YAML parser follows YAML 1.1, where unquoted `NO` is the boolean `false` and `1.10` is the number 1.1. Quote values that must stay strings (country codes, versions, ids with leading zeros); a properties file has no such typing.',
      },
    ],
  ),
  ...b.output(
    'sb-cfg-environment-variables',
    3,
    [
      'An environment variable maps to a property by upper-casing it and replacing dots with underscores (dashes are removed).',
      'Operating system environment variables beat values packaged with the application; command-line arguments beat both.',
    ],
    [
      {
        key: 'relaxed-env',
        question:
          'The program simulates environment variables of the deployment. What does it print?',
        code: `${BOOT_IMPORTS}
import org.springframework.core.env.*;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        var env = new StandardEnvironment();
        // The environment variables of this deployment:
        env.getPropertySources().replace("systemEnvironment", new SystemEnvironmentPropertySource(
            "systemEnvironment", Map.of("SHOP_MAXITEMS", "9", "SHOP_TAGS_0_", "sale")));

        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .environment(env)
            .properties("shop.name=Demo", "shop.max-items=5") // packaged defaults
            .run();
        ShopProperties shop = ctx.getBean(ShopProperties.class);
        System.out.println(shop.name() + " " + shop.maxItems() + " " + shop.tags());
    }
}

@SpringBootConfiguration
@EnableConfigurationProperties(ShopProperties.class)
class App {}

@ConfigurationProperties("shop")
record ShopProperties(String name, int maxItems, java.util.List<String> tags) {}`,
        output: 'Demo 9 [sale]',
        why: '`SHOP_MAXITEMS` binds to `shop.max-items` (uppercase, dots to underscores, dash removed) and overrides the packaged default 5. `SHOP_TAGS_0_` is the environment-variable form of the index `shop.tags[0]`. `shop.name` is not overridden, so the default stays.',
      },
      {
        key: 'command-line-wins',
        code: `${BOOT_IMPORTS}
import org.springframework.core.env.*;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        var env = new StandardEnvironment();
        // The environment variables of this deployment:
        env.getPropertySources().replace("systemEnvironment", new SystemEnvironmentPropertySource(
            "systemEnvironment", Map.of("SERVER_PORT", "9000", "APP_MODE", "env")));

        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .environment(env)
            .properties("server.port=8080", "app.mode=default", "app.region=eu") // packaged defaults
            .run("--app.mode=cli");
        Environment e = ctx.getEnvironment();
        System.out.println(e.getProperty("server.port"));
        System.out.println(e.getProperty("app.mode"));
        System.out.println(e.getProperty("app.region"));
    }
}

@SpringBootConfiguration
class App {}`,
        output: '9000\ncli\neu',
        why: 'Each key is looked up in the property sources in order of precedence: command-line arguments, then environment variables, then the packaged defaults. `app.mode` is set on the command line, `server.port` only in the environment, and `app.region` only in the defaults.',
      },
    ],
  ),
  ...b.output(
    'sb-cfg-profiles',
    3,
    [
      'Active profiles decide which `@Profile` beans and which profile-specific configuration are used.',
    ],
    [
      {
        key: 'profile-beans',
        code: `${BOOT_IMPORTS}

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .profiles("staging")
            .run();
        System.out.println(ctx.getBean(MailSender.class).describe());
        System.out.println(ctx.getBeansOfType(MailSender.class).size());
    }
}

interface MailSender { String describe(); }

@SpringBootConfiguration
class App {
    @Bean
    @Profile("dev")
    MailSender consoleSender() { return () -> "prints mails to the console"; }

    @Bean
    @Profile("!dev")
    MailSender smtpSender() { return () -> "sends mails over SMTP"; }
}`,
        output: 'sends mails over SMTP\n1',
        why: 'Only `staging` is active. `@Profile("dev")` does not match, and `@Profile("!dev")` matches every profile set without `dev`, so exactly one `MailSender` is registered.',
      },
      {
        key: 'profile-document',
        code: `${BOOT_IMPORTS}
import java.nio.file.*;

public class Main {
    public static void main(String[] args) throws Exception {
        Path config = Files.createTempFile("application", ".yml");
        Files.writeString(config, """
            shop:
              name: Corner Shop
              payment-url: http://localhost:9999
            ---
            spring:
              config:
                activate:
                  on-profile: prod
            shop:
              payment-url: https://pay.example.com
            """);
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .properties("spring.config.location=file:" + config)
            .profiles("prod")
            .run();
        System.out.println(ctx.getEnvironment().getProperty("shop.name"));
        System.out.println(ctx.getEnvironment().getProperty("shop.payment-url"));
    }
}

@SpringBootConfiguration
class App {}`,
        output: 'Corner Shop\nhttps://pay.example.com',
        why: 'A YAML file can hold several documents separated by `---`. The second one applies only when the `prod` profile is active and overrides just the keys it defines, so `shop.name` still comes from the first document. Profile-specific files such as `application-prod.yml` work the same way.',
      },
    ],
  ),
  ...b.fails(
    'sb-cfg-validated-properties',
    4,
    'With `@Validated`, constraints on configuration properties are checked when the application starts.',
    [
      {
        key: 'missing-required',
        question:
          'Production forgot to configure the payment API key. Why is it good that this application fails at startup?',
        code: `${BOOT_IMPORTS}
import org.springframework.validation.annotation.Validated;
import jakarta.validation.constraints.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .properties("logging.level.root=OFF", "payment.base-url=https://pay.example.com")
            .run();
        System.out.println(ctx.getBean(PaymentProperties.class));
    }
}

@SpringBootConfiguration
@EnableConfigurationProperties(PaymentProperties.class)
class App {}

@Validated
@ConfigurationProperties("payment")
record PaymentProperties(@NotBlank String baseUrl, @NotBlank String apiKey) {}`,
        error: "Could not bind properties to 'PaymentProperties'",
        correct:
          '`payment.api-key` is missing, so the `@NotBlank` constraint fails during binding and the application refuses to start instead of failing on the first payment.',
        wrong: [
          'Records cannot be validated; the failure comes from `@Validated` being on a record.',
          'The key must be written `payment.apiKey`; kebab-case is not supported for records.',
          '`@NotBlank` only works on request bodies in controllers.',
        ],
        why: 'Validating configuration properties turns a missing or invalid setting into a clear startup error (“Binding validation errors on payment”). Failing fast during deployment is far better than discovering the problem with real traffic. Bean Validation works on records and on configuration properties.',
      },
      {
        key: 'range',
        question: 'Why does this application refuse to start?',
        code: `${BOOT_IMPORTS}
import org.springframework.validation.annotation.Validated;
import jakarta.validation.constraints.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .properties("logging.level.root=OFF", "pool.min-size=10", "pool.max-size=500")
            .run();
        System.out.println(ctx.getBean(PoolProperties.class));
    }
}

@SpringBootConfiguration
@EnableConfigurationProperties(PoolProperties.class)
class App {}

@Validated
@ConfigurationProperties("pool")
record PoolProperties(@Min(1) int minSize, @Max(100) int maxSize) {}`,
        error: "Could not bind properties to 'PoolProperties'",
        correct:
          '`pool.max-size=500` violates `@Max(100)`, so binding validation fails at startup.',
        wrong: [
          '`min-size` and `max-size` cannot both be set in one call.',
          'Numbers in properties must be quoted to bind to `int`.',
          '`@Max` applies to string length, and `500` has only three characters.',
        ],
        why: 'The value binds to `int` without problems, and then `@Max(100)` rejects it. The failure report names the property, the value and the violated constraint, which makes a bad deployment configuration obvious.',
      },
    ],
  ),
  ...b.concept(
    'sb-cfg-secrets',
    4,
    'Secrets must not live where source code, images or logs can expose them.',
    [
      {
        key: 'committed-password',
        question:
          'A team keeps this file in Git so that every environment has working defaults. What is the best change?',
        snippet: yaml(`spring:
  datasource:
    url: jdbc:postgresql://db.prod.internal:5432/shop
    username: shop
    password: S3cr3t-Prod!`),
        correct:
          'Remove the password from the repository, reference `${DB_PASSWORD}` (or bind `SPRING_DATASOURCE_PASSWORD`), and provide it at run time from a secret store; rotate the leaked password.',
        wrong: [
          'Base64-encode the password in the file so that it cannot be read.',
          'Move the file to `src/test/resources` so that it is not packaged.',
          'Keep it, because the repository is private.',
        ],
        why: 'Anything committed lives forever in Git history and in every clone and image built from it, so the password must be considered leaked and rotated. Base64 is encoding, not encryption. Externalized configuration lets the platform inject secrets (environment variables, mounted files, a vault) per environment.',
      },
      {
        key: 'actuator-env',
        question:
          'Which practice best protects secrets that are provided to a Spring Boot application through configuration?',
        correct:
          'Inject them from a secret manager or the platform at run time, keep Actuator endpoints like `env` and `configprops` unexposed (or secured), and never log configuration values.',
        wrong: [
          'Store them as `@Value` defaults in the code so that they are compiled into the jar.',
          'Print the effective configuration at startup so that misconfigurations are easy to spot.',
          'Put them in `application.yml` and set the file permissions to read-only.',
        ],
        why: 'Secrets leak through code, images, logs and diagnostic endpoints. Spring Boot masks values shown by the `env` and `configprops` endpoints by default, but those endpoints should still not be exposed publicly. Logging configuration at startup prints secrets into log storage that many people can read.',
      },
    ],
  ),
  ...b.output(
    'sb-cfg-units',
    5,
    [
      'Spring Boot converts strings such as `30s` and `10MB` into `Duration` and `DataSize`; plain numbers use the default unit.',
    ],
    [
      {
        key: 'duration-and-size',
        code: `${BOOT_IMPORTS}
import java.time.Duration;
import org.springframework.util.unit.DataSize;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .properties("upload.timeout=2m", "upload.max-size=10MB", "upload.read-timeout=500")
            .run();
        UploadProperties upload = ctx.getBean(UploadProperties.class);
        System.out.println(upload.timeout().toSeconds());
        System.out.println(upload.maxSize().toKilobytes());
        System.out.println(upload.readTimeout().toMillis());
    }
}

@SpringBootConfiguration
@EnableConfigurationProperties(UploadProperties.class)
class App {}

@ConfigurationProperties("upload")
record UploadProperties(Duration timeout, DataSize maxSize, Duration readTimeout) {}`,
        output: '120\n10240\n500',
        why: '`2m` is two minutes and `10MB` is 10 × 1024 kilobytes. A bare number for a `Duration` is read in milliseconds by default, so `500` is 500 ms. Typed units avoid the classic “was that seconds or milliseconds?” bug.',
      },
      {
        key: 'data-size-unit',
        code: `${BOOT_IMPORTS}
import org.springframework.boot.convert.DataSizeUnit;
import org.springframework.util.unit.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .properties("upload.max-file=5", "upload.max-request=5")
            .run();
        UploadLimits limits = ctx.getBean(UploadLimits.class);
        System.out.println(limits.maxFile().toKilobytes());
        System.out.println(limits.maxRequest().toBytes());
    }
}

@SpringBootConfiguration
@EnableConfigurationProperties(UploadLimits.class)
class App {}

@ConfigurationProperties("upload")
record UploadLimits(@DataSizeUnit(DataUnit.MEGABYTES) DataSize maxFile, DataSize maxRequest) {}`,
        output: '5120\n5',
        why: 'A bare number for a `DataSize` is read in bytes unless `@DataSizeUnit` says otherwise, so the same `5` means 5 MB for `maxFile` and 5 bytes for `maxRequest`, an upload limit that would reject everything. Writing `5MB` in the configuration removes the ambiguity.',
      },
      {
        key: 'duration-unit',
        code: `${BOOT_IMPORTS}
import org.springframework.boot.convert.DurationUnit;
import java.time.Duration;
import java.time.temporal.ChronoUnit;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .properties("session.idle-timeout=30", "session.absolute-timeout=30")
            .run();
        SessionProperties session = ctx.getBean(SessionProperties.class);
        System.out.println(session.idleTimeout());
        System.out.println(session.absoluteTimeout());
    }
}

@SpringBootConfiguration
@EnableConfigurationProperties(SessionProperties.class)
class App {}

@ConfigurationProperties("session")
record SessionProperties(
    @DurationUnit(ChronoUnit.MINUTES) Duration idleTimeout,
    Duration absoluteTimeout) {}`,
        output: 'PT30M\nPT0.03S',
        why: '`@DurationUnit(ChronoUnit.MINUTES)` changes the unit for bare numbers, so `30` is 30 minutes. Without it, the same `30` is 30 milliseconds. Writing `30m` in the configuration avoids depending on the default unit at all.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Security

const SECURITY_IMPORTS = `import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.mock.web.MockServletContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import jakarta.servlet.Filter;
import java.util.Base64;`;

/** Starts a web context with the given classes and MockMvc behind the Spring Security filter chain. */
const SECURITY_MAIN_START = `        var ctx = new AnnotationConfigWebApplicationContext();
        ctx.register(SecurityConfig.class, ApiController.class);
        ctx.setServletContext(new MockServletContext());
        ctx.refresh();
        MockMvc mvc = MockMvcBuilders.webAppContextSetup(ctx)
            .addFilters(ctx.getBean("springSecurityFilterChain", Filter.class))
            .build();`;

const BASIC = `    static String basic(String user, String password) {
        return "Basic " + Base64.getEncoder().encodeToString((user + ":" + password).getBytes());
    }`;

const API_CONTROLLER = `@RestController
class ApiController {
    @GetMapping("/public/status") String status() { return "up"; }
    @GetMapping("/admin/stats") String stats() { return "stats"; }
    @GetMapping("/orders") String orders() { return "orders"; }
    @PostMapping("/orders") String create() { return "created"; }
}`;

export const securityFamilies: readonly QuestionSource[] = [
  ...b.output(
    'sb-sec-authn-authz',
    1,
    [
      '401 means the caller is not authenticated; 403 means the caller is authenticated but not allowed.',
    ],
    [
      {
        key: 'three-callers',
        code: `${SECURITY_IMPORTS}

public class Main {
    public static void main(String[] args) throws Exception {
${SECURITY_MAIN_START}
        System.out.println(mvc.perform(get("/admin/stats")).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(get("/admin/stats").header("Authorization", basic("ann", "ann-pw"))).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(get("/admin/stats").header("Authorization", basic("root", "root-pw"))).andReturn().getResponse().getStatus());
    }

${BASIC}
}

@Configuration
@EnableWebSecurity
@EnableWebMvc
class SecurityConfig {
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth
                .requestMatchers("/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .httpBasic(basic -> {});
        return http.build();
    }

    @Bean
    UserDetailsService users() {
        return new InMemoryUserDetailsManager(
            User.withUsername("ann").password("{noop}ann-pw").roles("USER").build(),
            User.withUsername("root").password("{noop}root-pw").roles("ADMIN").build());
    }
}

${API_CONTROLLER}`,
        output: '401\n403\n200',
        why: 'Without credentials the request is not authenticated: 401, with a `WWW-Authenticate` challenge. Ann is authenticated but lacks the `ADMIN` role: 403. Root has the role: 200. Authentication answers “who are you?”, authorization “what may you do?”.',
      },
      {
        key: 'wrong-password',
        code: `${SECURITY_IMPORTS}

public class Main {
    public static void main(String[] args) throws Exception {
${SECURITY_MAIN_START}
        System.out.println(mvc.perform(get("/public/status")).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(get("/orders").header("Authorization", basic("ann", "wrong"))).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(get("/orders").header("Authorization", basic("ann", "ann-pw"))).andReturn().getResponse().getStatus());
    }

${BASIC}
}

@Configuration
@EnableWebSecurity
@EnableWebMvc
class SecurityConfig {
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth
                .requestMatchers("/public/**").permitAll()
                .anyRequest().authenticated())
            .httpBasic(basic -> {});
        return http.build();
    }

    @Bean
    UserDetailsService users() {
        return new InMemoryUserDetailsManager(
            User.withUsername("ann").password("{noop}ann-pw").roles("USER").build());
    }
}

${API_CONTROLLER}`,
        output: '200\n401\n200',
        why: '`/public/**` is open to everyone. A wrong password means authentication failed, which is 401, not 403: the server still does not know who the caller is. With the right password the authenticated rule is satisfied.',
      },
    ],
  ),
  ...b.multi(
    'sb-sec-filter-chain',
    2,
    'Spring Security works as a chain of servlet filters that runs before the request reaches a controller.',
    [
      {
        key: 'fundamentals',
        question:
          'Which statements about Spring Security in a Spring Boot web application are true?',
        correct: [
          'Security is enforced by a chain of servlet filters that runs before the `DispatcherServlet` and the controllers.',
          'A `SecurityFilterChain` bean defines which requests need which authorities and how users authenticate.',
          'With Spring Security on the class path and no configuration, Spring Boot secures every endpoint and generates a password at startup.',
        ],
        wrong: [
          'Controllers must check the logged-in user themselves; the framework only provides a login page.',
          'Authorization rules are evaluated after the controller method has run, so the response can be filtered.',
        ],
        why: 'Requests pass the security filters first: authentication filters establish the `SecurityContext`, and the authorization filter applies the rules from the `SecurityFilterChain`. A rejected request never reaches the controller. Spring Boot’s default is secure-by-default with a generated user password, which you replace with your own configuration.',
      },
    ],
  ),
  ...b.output(
    'sb-sec-password-hashing',
    2,
    ['BCrypt adds a random salt to every hash and stores it inside the hash.'],
    [
      {
        key: 'salted',
        code: `import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class Main {
    public static void main(String[] args) {
        var encoder = new BCryptPasswordEncoder();
        String first = encoder.encode("correct horse");
        String second = encoder.encode("correct horse");
        System.out.println(first.equals(second));
        System.out.println(encoder.matches("correct horse", first) + " " + encoder.matches("correct horse", second));
        System.out.println(encoder.matches("Correct horse", first));
        System.out.println(first.length() + " " + first.startsWith("$2a$10$"));
    }
}`,
        output: 'false\ntrue true\nfalse\n60 true',
        why: 'Each `encode` uses a new random salt, so two hashes of the same password differ; `matches` reads the salt (and the cost factor 10) from the stored hash and compares correctly. Never compare hashes with `equals`. Hashing is one-way: you can verify a password, not recover it.',
      },
      {
        key: 'delegating',
        code: `import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

public class Main {
    public static void main(String[] args) {
        PasswordEncoder encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
        String hash = encoder.encode("s3cret");
        System.out.println(hash.substring(0, 8));
        System.out.println(encoder.matches("s3cret", hash));
        System.out.println(encoder.matches("s3cret", "{noop}s3cret"));
        System.out.println(encoder.upgradeEncoding("{noop}s3cret"));
    }
}`,
        output: '{bcrypt}\ntrue\ntrue\ntrue',
        why: 'The delegating encoder prefixes hashes with the algorithm id, `{bcrypt}` by default, and dispatches `matches` on the prefix, so old `{noop}` or `{sha256}` values keep working. `upgradeEncoding` reports that a stored value uses an outdated encoding and should be re-hashed at the next successful login.',
      },
    ],
  ),
  ...b.fails(
    'sb-sec-plain-passwords',
    3,
    'How does the delegating password encoder know which algorithm produced a stored value?',
    [
      {
        key: 'no-prefix',
        question: 'Users imported from an old system cannot log in, and the check throws. Why?',
        code: `import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

public class Main {
    public static void main(String[] args) {
        PasswordEncoder encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
        String storedPassword = "summer2024";   // imported from the old system
        System.out.println(encoder.matches("summer2024", storedPassword));
    }
}`,
        error: 'there is no default password encoder configured',
        correct:
          'The stored value has no `{id}` prefix, so the delegating encoder cannot pick an algorithm; worse, the old system stored plain-text passwords, which must be hashed (for example with BCrypt) during migration.',
        wrong: [
          '`matches` expects the raw password second and the stored one first.',
          'Passwords shorter than 12 characters are rejected by Spring Security.',
          'The encoder must be a Spring bean; created with a factory method it has no algorithms.',
        ],
        why: '`DelegatingPasswordEncoder` reads the algorithm from the `{id}` prefix and refuses values without one. The real problem is that the old system kept plain-text passwords: hash them during the migration (or temporarily prefix with `{noop}` and force a reset), never store them as they are.',
      },
    ],
  ),
  ...b.output(
    'sb-sec-matcher-order',
    3,
    ['Authorization rules are checked from top to bottom, and the first matching rule decides.'],
    [
      {
        key: 'broad-rule-first',
        question:
          'A user without the `ADMIN` role calls the admin endpoint. What does this program print?',
        code: `${SECURITY_IMPORTS}

public class Main {
    public static void main(String[] args) throws Exception {
${SECURITY_MAIN_START}
        System.out.println(mvc.perform(get("/admin/stats").header("Authorization", basic("ann", "ann-pw"))).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(get("/admin/stats")).andReturn().getResponse().getStatus());
    }

${BASIC}
}

@Configuration
@EnableWebSecurity
@EnableWebMvc
class SecurityConfig {
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth
                .requestMatchers("/**").authenticated()
                .requestMatchers("/admin/**").hasRole("ADMIN"))
            .httpBasic(basic -> {});
        return http.build();
    }

    @Bean
    UserDetailsService users() {
        return new InMemoryUserDetailsManager(
            User.withUsername("ann").password("{noop}ann-pw").roles("USER").build());
    }
}

${API_CONTROLLER}`,
        output: '200\n401',
        why: '`/**` matches every path and comes first, so any authenticated user passes; the `/admin/**` rule is never reached. Order rules from the most specific to the most general and end with `anyRequest()`.',
      },
      {
        key: 'specific-first',
        question:
          'The rules are now ordered from specific to general. What does this program print?',
        code: `${SECURITY_IMPORTS}

public class Main {
    public static void main(String[] args) throws Exception {
${SECURITY_MAIN_START}
        System.out.println(mvc.perform(get("/admin/stats").header("Authorization", basic("ann", "ann-pw"))).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(get("/public/status")).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(get("/orders").header("Authorization", basic("ann", "ann-pw"))).andReturn().getResponse().getStatus());
    }

${BASIC}
}

@Configuration
@EnableWebSecurity
@EnableWebMvc
class SecurityConfig {
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth
                .requestMatchers("/admin/**").hasRole("ADMIN")
                .requestMatchers("/public/**").permitAll()
                .anyRequest().authenticated())
            .httpBasic(basic -> {});
        return http.build();
    }

    @Bean
    UserDetailsService users() {
        return new InMemoryUserDetailsManager(
            User.withUsername("ann").password("{noop}ann-pw").roles("USER").build());
    }
}

${API_CONTROLLER}`,
        output: '403\n200\n200',
        why: 'The admin rule now matches first and Ann lacks the role: 403. `/public/**` is open without credentials, and every other path only needs an authenticated user.',
      },
    ],
  ),
  ...b.output(
    'sb-sec-role-authority',
    4,
    [
      'A role is an authority whose name starts with `ROLE_`; `hasRole("X")` checks the authority `ROLE_X`.',
    ],
    [
      {
        key: 'authority-without-prefix',
        question:
          'The operator account was created with `authorities("ADMIN")`. What does this program print?',
        code: `${SECURITY_IMPORTS}

public class Main {
    public static void main(String[] args) throws Exception {
${SECURITY_MAIN_START}
        System.out.println(mvc.perform(get("/admin/stats").header("Authorization", basic("ops", "ops-pw"))).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(get("/admin/stats").header("Authorization", basic("root", "root-pw"))).andReturn().getResponse().getStatus());
    }

${BASIC}
}

@Configuration
@EnableWebSecurity
@EnableWebMvc
class SecurityConfig {
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth
                .requestMatchers("/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .httpBasic(basic -> {});
        return http.build();
    }

    @Bean
    UserDetailsService users() {
        return new InMemoryUserDetailsManager(
            User.withUsername("ops").password("{noop}ops-pw").authorities("ADMIN").build(),
            User.withUsername("root").password("{noop}root-pw").roles("ADMIN").build());
    }
}

${API_CONTROLLER}`,
        output: '403\n200',
        why: '`roles("ADMIN")` stores the authority `ROLE_ADMIN`, and `hasRole("ADMIN")` looks for exactly that. `authorities("ADMIN")` stores `ADMIN` without the prefix, so the operator is authenticated but denied. Use `hasAuthority("ADMIN")` for plain authorities, such as scopes from a token.',
      },
    ],
  ),
  ...b.output(
    'sb-sec-csrf',
    4,
    [
      'CSRF protection is on by default and rejects state-changing requests that do not carry a CSRF token.',
    ],
    [
      {
        key: 'post-without-token',
        code: `${SECURITY_IMPORTS}

public class Main {
    public static void main(String[] args) throws Exception {
${SECURITY_MAIN_START}
        System.out.println(mvc.perform(get("/orders").header("Authorization", basic("ann", "ann-pw"))).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(post("/orders").header("Authorization", basic("ann", "ann-pw"))).andReturn().getResponse().getStatus());
    }

${BASIC}
}

@Configuration
@EnableWebSecurity
@EnableWebMvc
class SecurityConfig {
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
            .httpBasic(basic -> {});
        return http.build();
    }

    @Bean
    UserDetailsService users() {
        return new InMemoryUserDetailsManager(
            User.withUsername("ann").password("{noop}ann-pw").roles("USER").build());
    }
}

${API_CONTROLLER}`,
        output: '200\n403',
        why: 'The `GET` is allowed. The `POST` is authenticated but carries no CSRF token, so the CSRF filter rejects it with 403. That protects browser sessions, where cookies are sent automatically by cross-site forms.',
      },
      {
        key: 'stateless-api',
        code: `${SECURITY_IMPORTS}
import org.springframework.security.config.http.SessionCreationPolicy;

public class Main {
    public static void main(String[] args) throws Exception {
${SECURITY_MAIN_START}
        System.out.println(mvc.perform(post("/orders").header("Authorization", basic("ann", "ann-pw"))).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(post("/orders")).andReturn().getResponse().getStatus());
    }

${BASIC}
}

@Configuration
@EnableWebSecurity
@EnableWebMvc
class SecurityConfig {
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
            .httpBasic(basic -> {})
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .csrf(csrf -> csrf.disable());
        return http.build();
    }

    @Bean
    UserDetailsService users() {
        return new InMemoryUserDetailsManager(
            User.withUsername("ann").password("{noop}ann-pw").roles("USER").build());
    }
}

${API_CONTROLLER}`,
        output: '200\n401',
        why: 'This API is stateless: every request carries its own credentials in a header and no session cookie exists, so CSRF (which abuses automatically sent cookies) does not apply and disabling it is reasonable. Authentication is still required, so the anonymous `POST` gets 401. Disabling CSRF on a cookie-based browser application would be a vulnerability.',
      },
    ],
  ),
  ...b.fails(
    'sb-sec-method-security',
    4,
    'With method security, the check runs when the proxied method is called, using the current `SecurityContext`.',
    [
      {
        key: 'pre-authorize',
        question:
          'A user with the `USER` role calls the report service. Why does the second call fail?',
        code: `import org.springframework.context.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(SecurityConfig.class, ReportService.class);
        // What the authentication filter does for a logged-in request:
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
            "ann", null, AuthorityUtils.createAuthorityList("ROLE_USER")));
        ReportService reports = ctx.getBean(ReportService.class);
        System.out.println(reports.myReport());
        System.out.println(reports.allReports());
    }
}

@Configuration
@EnableMethodSecurity
class SecurityConfig {}

class ReportService {
    @PreAuthorize("isAuthenticated()")
    String myReport() { return "ann's report"; }

    @PreAuthorize("hasRole('ADMIN')")
    String allReports() { return "all reports"; }
}`,
        error: 'AuthorizationDeniedException: Access Denied',
        correct:
          '`allReports` requires `ROLE_ADMIN`, and the current authentication only has `ROLE_USER`, so the method-security proxy denies the call before the method runs.',
        wrong: [
          '`@PreAuthorize` only works on controllers, so the failure comes from a missing web context.',
          'The first call consumed the authentication; each call needs a new login.',
          '`hasRole` expressions must be written as `hasRole("ROLE_ADMIN")`.',
        ],
        why: '`@EnableMethodSecurity` wraps beans with `@PreAuthorize` methods in a proxy that evaluates the expression against the current `SecurityContext`. It works on any bean, which protects services even when a new entry point forgets a URL rule. `hasRole` adds the `ROLE_` prefix itself.',
      },
    ],
  ),
  ...b.multi(
    'sb-sec-common-mistakes',
    5,
    'Think about what an attacker sees from outside and what is stored inside.',
    [
      {
        key: 'review',
        question:
          'A security review of a Spring Boot service lists these findings. Which are real vulnerabilities?',
        correct: [
          '`management.endpoints.web.exposure.include=*` on the public port, without authentication.',
          'Users are stored with `{noop}` passwords in the production database.',
          'CSRF protection is disabled although the browser front end authenticates with a session cookie.',
        ],
        wrong: [
          'The health endpoint `/actuator/health` returns `{"status":"UP"}` to anonymous callers.',
          'Passwords are stored as BCrypt hashes with the default cost factor.',
        ],
        why: 'Exposing all Actuator endpoints publicly can reveal configuration, heap dumps and internal URLs, and some endpoints change state. Plain-text passwords leak every account at once in a breach. CSRF protection is required when browsers send cookies automatically. A bare health status is a common, harmless public endpoint for load balancers, and BCrypt is an appropriate password hash.',
      },
      {
        key: 'token-apis',
        question:
          'Which statements about securing a stateless REST API with bearer tokens (JWTs) are true?',
        correct: [
          'The server must verify the token’s signature and expiry on every request.',
          'A JWT payload is only encoded, so it must not contain secrets.',
          'Short token lifetimes limit the damage of a stolen token.',
        ],
        wrong: [
          'Because tokens are signed, they can be sent over plain HTTP safely.',
          'Authorization rules are unnecessary once a token is valid, since only real users get tokens.',
        ],
        why: 'A signature proves integrity, not confidentiality: anyone can decode the payload, and anyone who steals the token can use it, so HTTPS and short lifetimes matter. A valid token says who the caller is (authentication); the API still has to check what that caller may do (authorization), for example with `hasAuthority("SCOPE_orders.write")`.',
      },
      {
        key: 'review-config',
        question: 'Which of these configuration choices are security mistakes in production?',
        correct: [
          'Returning `server.error.include-stacktrace=always` error responses to clients.',
          'Allowing CORS from any origin (`*`) together with credentials for a cookie-based front end.',
        ],
        wrong: [
          'Serving the API only over HTTPS behind a load balancer.',
          'Exposing only `health` and `info` over HTTP and the other endpoints on a separate management port.',
          'Hashing passwords with BCrypt through a `PasswordEncoder` bean.',
        ],
        why: 'Stack traces disclose internals to attackers, and a wildcard CORS policy with credentials lets any website make authenticated calls on behalf of a logged-in user (browsers refuse the literal `*` with credentials, so such setups usually reflect the caller’s origin, which is just as bad). HTTPS, a minimal set of exposed endpoints and adaptive password hashing are good practice.',
      },
    ],
  ),
];
