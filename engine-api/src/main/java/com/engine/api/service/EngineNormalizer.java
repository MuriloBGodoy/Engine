package com.engine.api.service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

final class EngineNormalizer {

  private static final Map<String, Object> DEFAULT_SETTINGS =
      Map.of(
          "profile",
          Map.of(
              "displayName", "",
              "username", "",
              "phone", "",
              "location", "",
              "bio", "",
              "avatar", "",
              "banner", ""),
          "preferences",
          Map.of(
              "language", "pt-BR",
              "currency", "BRL",
              "timezone", "America/Sao_Paulo",
              "theme", "dark",
              "density", "comfortable",
              "startPage", "/",
              "defaultGarageSort", "progress-desc",
              "annualIncomeGoal", ""),
          "notifications",
          Map.of(
              "emailGoalProgress", true,
              "emailMarketUpdates", true,
              "emailSecurity", true,
              "inAppReminders", true,
              "weeklyDigest", false,
              "quietHours", true),
          "privacy",
          Map.of(
              "showEmailInSidebar", true,
              "shareAnonymousUsage", false,
              "saveImagesLocally", true,
              "lockSensitiveValues", false),
          "security",
          Map.of(
              "twoFactorReminder", true,
              "sessionTimeout", "30",
              "loginAlerts", true));

  private EngineNormalizer() {}

  static Map<String, Object> defaultSettings() {
    return deepMerge(Map.of());
  }

  static Map<String, Object> normalizeSettings(Map<String, Object> settings) {
    Map<String, Object> merged = deepMerge(settings == null ? Map.of() : settings);
    Map<String, Object> profile = mutableMap(merged.get("profile"));

    profile.put("displayName", truncate(string(profile.get("displayName")).trim(), 80));
    profile.put("username", normalizeUsername(string(profile.get("username"))));
    profile.put("phone", normalizePhone(string(profile.get("phone"))));
    profile.put("location", truncate(string(profile.get("location")).trim(), 80));
    profile.put("bio", truncate(string(profile.get("bio")).trim(), 280));
    profile.put("avatar", string(profile.get("avatar")).trim());
    merged.put("profile", profile);

    return merged;
  }

  static Map<String, Object> normalizeCar(Map<String, Object> car) {
    Map<String, Object> normalized = new LinkedHashMap<>();
    normalized.put("id", truncate(string(car.getOrDefault("id", UUID.randomUUID().toString())), 80));
    normalized.put("brand", truncate(string(car.get("brand")).trim(), 80));
    normalized.put("model", truncate(string(car.get("model")).trim(), 120));
    normalized.put("year", truncate(string(car.get("year")).trim(), 40));
    normalized.put("targetValue", positiveNumber(car.get("targetValue")));
    normalized.put("savedValue", positiveNumber(car.get("savedValue")));
    normalized.put("image", string(car.get("image")).trim());
    normalized.put("updatedAt", string(car.getOrDefault("updatedAt", Instant.now().toString())));
    return normalized;
  }

  static Map<String, Object> normalizeCommunityState(Map<String, Object> state) {
    Map<String, Object> normalized = new LinkedHashMap<>();
    normalized.put("interactions", mutableMap(state == null ? null : state.get("interactions")));
    normalized.put("following", list(state == null ? null : state.get("following")));
    normalized.put("sharedGoalIds", list(state == null ? null : state.get("sharedGoalIds")));
    normalized.put("savedVideos", list(state == null ? null : state.get("savedVideos")));
    return normalized;
  }

  static String normalizeUsername(String username) {
    String clean =
        username == null
            ? ""
            : username
                .trim()
                .toLowerCase(Locale.ROOT)
                .replaceFirst("^@+", "")
                .replaceAll("[^a-z0-9._]", "");
    clean = truncate(clean, 24);
    return clean.isBlank() ? "" : "@" + clean;
  }

  static String usernameDocId(String username) {
    return normalizeUsername(username).replaceFirst("^@", "");
  }

  static String normalizePhone(String phone) {
    return truncate(
        (phone == null ? "" : phone).trim().replaceAll("[^\\d+()\\-\\s]", "").replaceAll("\\s+", " "),
        24);
  }

  static Map<String, Object> profileSnapshot(Map<String, Object> settings, String userId) {
    Map<String, Object> profile = mutableMap(settings.get("profile"));
    String author = string(profile.get("displayName")).isBlank() ? "Usuário Engine" : string(profile.get("displayName"));
    String username = normalizeUsername(string(profile.get("username")));
    if (username.isBlank()) {
      username = "@engine." + userId.substring(0, Math.min(6, userId.length()));
    }

    return Map.of(
        "author", author,
        "username", username,
        "avatar", string(profile.get("avatar")),
        "avatarInitials", initials(author),
        "city", string(profile.get("location")).isBlank() ? "Engine Garage" : string(profile.get("location")),
        "note", string(profile.get("bio")));
  }

  @SuppressWarnings("unchecked")
  static Map<String, Object> mutableMap(Object value) {
    return value instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : new LinkedHashMap<>();
  }

  static String string(Object value) {
    return value == null ? "" : String.valueOf(value);
  }

  static double positiveNumber(Object value) {
    try {
      return Math.max(Double.parseDouble(String.valueOf(value)), 0);
    } catch (RuntimeException error) {
      return 0;
    }
  }

  private static String initials(String text) {
    StringBuilder builder = new StringBuilder();
    for (String part : text.trim().split("\\s+")) {
      if (!part.isBlank()) {
        builder.append(part.charAt(0));
      }
      if (builder.length() == 2) {
        break;
      }
    }
    return builder.toString().toUpperCase(Locale.ROOT);
  }

  private static String truncate(String value, int maxLength) {
    return value.length() <= maxLength ? value : value.substring(0, maxLength);
  }

  @SuppressWarnings("unchecked")
  private static List<Object> list(Object value) {
    return value instanceof List<?> items ? (List<Object>) items : List.of();
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> deepMerge(Map<String, Object> settings) {
    Map<String, Object> merged = new LinkedHashMap<>();
    DEFAULT_SETTINGS.forEach(
        (key, value) -> merged.put(key, new LinkedHashMap<>((Map<String, Object>) value)));

    settings.forEach(
        (key, value) -> {
          if (merged.get(key) instanceof Map<?, ?> existing && value instanceof Map<?, ?> incoming) {
            Map<String, Object> nested = new LinkedHashMap<>((Map<String, Object>) existing);
            nested.putAll((Map<String, Object>) incoming);
            merged.put(key, nested);
          } else {
            merged.put(key, value);
          }
        });
    return merged;
  }
}
