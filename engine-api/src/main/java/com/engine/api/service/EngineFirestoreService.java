package com.engine.api.service;

import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.FieldValue;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.Query.Direction;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.SetOptions;
import com.google.cloud.firestore.WriteBatch;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EngineFirestoreService {

  private static final String USERS = "users";
  private static final String USERNAMES = "usernames";
  private static final String COMMUNITY = "communityGoals";
  private static final String PUBLIC_PROFILES = "publicProfiles";

  private final Firestore firestore;

  public EngineFirestoreService(Firestore firestore) {
    this.firestore = firestore;
  }

  public List<Map<String, Object>> getCars(String userId) throws Exception {
    List<Map<String, Object>> cars = new ArrayList<>();
    for (DocumentSnapshot snapshot : userCars(userId).get().get().getDocuments()) {
      cars.add(EngineNormalizer.normalizeCar(FirestoreMapper.withId(snapshot)));
    }
    cars.sort(Comparator.comparing(car -> String.valueOf(car.get("updatedAt")), Comparator.reverseOrder()));
    return cars;
  }

  public Map<String, Object> saveCar(String userId, Map<String, Object> car) throws Exception {
    Map<String, Object> normalized = EngineNormalizer.normalizeCar(car);
    userCar(userId, String.valueOf(normalized.get("id"))).set(normalized, SetOptions.merge()).get();
    syncCommunityCar(userId, normalized);
    return normalized;
  }

  public void deleteCar(String userId, String carId) throws Exception {
    WriteBatch batch = firestore.batch();
    batch.delete(userCar(userId, carId));
    batch.delete(firestore.collection(COMMUNITY).document("goal-" + userId + "-" + carId));
    batch.delete(firestore.collection(COMMUNITY).document("goal-" + userId + "-user-" + carId));
    batch.commit().get();
  }

  public void resetCars(String userId) throws Exception {
    WriteBatch batch = firestore.batch();
    for (DocumentSnapshot snapshot : userCars(userId).get().get().getDocuments()) {
      batch.delete(snapshot.getReference());
    }
    for (DocumentSnapshot snapshot :
        firestore.collection(COMMUNITY).whereEqualTo("ownerId", userId).get().get().getDocuments()) {
      batch.delete(snapshot.getReference());
    }
    batch.commit().get();
  }

  public Map<String, Object> getSettings(String userId) throws Exception {
    DocumentSnapshot snapshot = userSettings(userId).get().get();
    return EngineNormalizer.normalizeSettings(snapshot.exists() ? FirestoreMapper.normalizeMap(snapshot.getData()) : Map.of());
  }

  public Map<String, Object> saveSettings(String userId, Map<String, Object> settings) throws Exception {
    Map<String, Object> normalized = EngineNormalizer.normalizeSettings(settings);
    reserveUsername(String.valueOf(EngineNormalizer.mutableMap(normalized.get("profile")).get("username")), userId);
    userSettings(userId).set(normalized, SetOptions.merge()).get();
    syncPublicProfile(userId, normalized);
    syncCommunityProfile(userId, normalized);
    return normalized;
  }

  public Map<String, Object> resetSettings(String userId) throws Exception {
    userSettings(userId).delete().get();
    return EngineNormalizer.defaultSettings();
  }

  public Map<String, Object> getCommunityState(String userId) throws Exception {
    DocumentSnapshot snapshot = userCommunity(userId).get().get();
    return EngineNormalizer.normalizeCommunityState(
        snapshot.exists() ? FirestoreMapper.normalizeMap(snapshot.getData()) : Map.of());
  }

  public Map<String, Object> saveCommunityState(String userId, Map<String, Object> state) throws Exception {
    Map<String, Object> normalized = EngineNormalizer.normalizeCommunityState(state);
    userCommunity(userId).set(normalized, SetOptions.merge()).get();
    return normalized;
  }

  public List<Map<String, Object>> getCommunityGoals(String userId) throws Exception {
    List<Map<String, Object>> goals = new ArrayList<>();
    for (DocumentSnapshot snapshot :
        firestore.collection(COMMUNITY).orderBy("updatedAt", Direction.DESCENDING).limit(50).get().get().getDocuments()) {
      goals.add(normalizeCommunityGoal(FirestoreMapper.withId(snapshot), userId));
    }
    return goals;
  }

  public Map<String, Object> shareCommunityGoal(String userId, Map<String, Object> goal) throws Exception {
    Map<String, Object> settings = getSettings(userId);
    Map<String, Object> profile = EngineNormalizer.profileSnapshot(settings, userId);
    syncPublicProfile(userId, settings);
    String carId = String.valueOf(goal.get("id"));
    String goalId = "goal-" + userId + "-" + carId;
    DocumentReference goalRef = firestore.collection(COMMUNITY).document(goalId);
    DocumentSnapshot existing = goalRef.get().get();
    Map<String, Object> existingData = existing.exists() ? FirestoreMapper.normalizeMap(existing.getData()) : Map.of();

    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("id", goalId);
    payload.put("ownerId", userId);
    payload.put("carId", carId);
    payload.put("author", profile.get("author"));
    payload.put("username", profile.get("username"));
    payload.put("avatar", profile.get("avatar"));
    payload.put("avatarInitials", profile.get("avatarInitials"));
    payload.put("city", profile.get("city"));
    payload.put("title", EngineNormalizer.string(goal.get("brand")) + " " + EngineNormalizer.string(goal.get("model")));
    payload.put("brand", EngineNormalizer.string(goal.get("brand")));
    payload.put("model", EngineNormalizer.string(goal.get("model")));
    payload.put("year", EngineNormalizer.string(goal.get("year")));
    payload.put("image", EngineNormalizer.string(goal.get("image")));
    payload.put("savedValue", EngineNormalizer.positiveNumber(goal.get("savedValue")));
    payload.put("targetValue", EngineNormalizer.positiveNumber(goal.get("targetValue")));
    payload.put("note", profile.get("note"));
    payload.put("verified", true);
    payload.put("likesBy", existingData.getOrDefault("likesBy", Map.of()));
    payload.put("comments", existingData.getOrDefault("comments", List.of()));
    payload.put("ratingsBy", existingData.getOrDefault("ratingsBy", Map.of()));
    payload.put("createdAt", existingData.getOrDefault("createdAt", FieldValue.serverTimestamp()));
    payload.put("updatedAt", FieldValue.serverTimestamp());

    goalRef.set(payload, SetOptions.merge()).get();
    return Map.of("id", goalId);
  }

  public void deleteCommunityGoal(String userId, String goalId) throws Exception {
    DocumentReference goalRef = firestore.collection(COMMUNITY).document(goalId);
    DocumentSnapshot goal = goalRef.get().get();
    if (!goal.exists()) return;
    if (!userId.equals(goal.getString("ownerId"))) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Você só pode remover metas do seu perfil.");
    }
    goalRef.delete().get();
  }

  public void deleteMyCommunityGoals(String userId) throws Exception {
    WriteBatch batch = firestore.batch();
    List<QueryDocumentSnapshot> docs =
        firestore.collection(COMMUNITY).whereEqualTo("ownerId", userId).get().get().getDocuments();
    for (QueryDocumentSnapshot snapshot : docs) {
      batch.delete(snapshot.getReference());
    }
    if (!docs.isEmpty()) {
      batch.commit().get();
    }
  }

  public void toggleCommunityLike(String userId, String goalId, boolean liked) throws Exception {
    DocumentReference goalRef = firestore.collection(COMMUNITY).document(goalId);
    DocumentSnapshot goal = goalRef.get().get();
    Map<String, Object> goalData = goal.exists() ? FirestoreMapper.normalizeMap(goal.getData()) : null;
    if (goalData != null) {
      goalData.put("id", goalId);
    }

    goalRef.update(Map.of("likesBy." + userId, liked ? true : FieldValue.delete(), "updatedAt", FieldValue.serverTimestamp())).get();

    if (liked && goalData != null) {
      notifyOwner(userId, goalData, "like", " curtiu sua meta ");
    }
  }

  public void addCommunityComment(String userId, String goalId, String comment) throws Exception {
    DocumentReference goalRef = firestore.collection(COMMUNITY).document(goalId);
    DocumentSnapshot goal = goalRef.get().get();
    Map<String, Object> goalData = goal.exists() ? FirestoreMapper.normalizeMap(goal.getData()) : null;
    if (goalData != null) {
      goalData.put("id", goalId);
    }
    Map<String, Object> actor = EngineNormalizer.profileSnapshot(getSettings(userId), userId);
    Map<String, Object> payload =
        Map.of(
            "userId", userId,
            "author", actor.get("author"),
            "username", actor.get("username"),
            "avatar", actor.get("avatar"),
            "avatarInitials", actor.get("avatarInitials"),
            "text", truncate(comment, 180),
            "createdAt", Instant.now().toString());

    goalRef.update(Map.of("comments", FieldValue.arrayUnion(payload), "updatedAt", FieldValue.serverTimestamp())).get();

    if (goalData != null) {
      notifyOwner(userId, goalData, "comment", " comentou na sua meta ");
    }
  }

  public void rateCommunityGoal(String userId, String goalId, int rating) throws Exception {
    DocumentReference goalRef = firestore.collection(COMMUNITY).document(goalId);
    DocumentSnapshot goal = goalRef.get().get();
    Map<String, Object> goalData = goal.exists() ? FirestoreMapper.normalizeMap(goal.getData()) : null;
    if (goalData != null) {
      goalData.put("id", goalId);
    }
    int normalizedRating = Math.max(1, Math.min(rating, 5));

    goalRef.update(Map.of("ratingsBy." + userId, normalizedRating, "updatedAt", FieldValue.serverTimestamp())).get();

    if (goalData != null && !userId.equals(goalData.get("ownerId"))) {
      notifyOwner(userId, goalData, "rating", " avaliou sua meta ");
    }
  }

  public List<Map<String, Object>> getNotifications(String userId) throws Exception {
    List<Map<String, Object>> notifications = new ArrayList<>();
    for (DocumentSnapshot snapshot :
        userNotifications(userId).orderBy("createdAt", Direction.DESCENDING).get().get().getDocuments()) {
      notifications.add(FirestoreMapper.withId(snapshot));
    }
    return notifications;
  }

  public Map<String, Object> getPublicProfiles(String viewerId) throws Exception {
    Map<String, Object> profiles = new HashMap<>();
    for (DocumentSnapshot snapshot : firestore.collection(PUBLIC_PROFILES).get().get().getDocuments()) {
      Map<String, Object> profile = FirestoreMapper.withId(snapshot);
      profiles.put(snapshot.getId(), profile);
    }
    return profiles;
  }

  public Map<String, Object> getPublicProfile(String viewerId, String profileUserId) throws Exception {
    Map<String, Object> profile = readPublicProfile(profileUserId);
    List<Map<String, Object>> goals = new ArrayList<>();
    double totalProgress = 0;
    int totalLikes = 0;

    for (DocumentSnapshot snapshot :
        firestore.collection(COMMUNITY).whereEqualTo("ownerId", profileUserId).get().get().getDocuments()) {
      Map<String, Object> goal = normalizeCommunityGoal(FirestoreMapper.withId(snapshot), viewerId);
      goals.add(goal);
      totalProgress += progress(goal);
      totalLikes += EngineNormalizer.mutableMap(goal.get("likesBy")).size();
    }

    goals.sort(Comparator.comparing(goal -> String.valueOf(goal.get("updatedAt")), Comparator.reverseOrder()));
    profile.put("goals", goals);
    profile.put("goalsCount", goals.size());
    profile.put("likesCount", totalLikes);
    profile.put("averageProgress", goals.isEmpty() ? 0 : totalProgress / goals.size());
    return profile;
  }

  public void notifyFollow(String actorId, String ownerId) throws Exception {
    if (ownerId == null || ownerId.isBlank() || ownerId.equals(actorId)) return;

    Map<String, Object> actor = EngineNormalizer.profileSnapshot(getSettings(actorId), actorId);
    userNotifications(ownerId)
        .add(
            Map.of(
                "type", "follow",
                "actorId", actorId,
                "recipientId", ownerId,
                "actorName", actor.get("author"),
                "actorUsername", actor.get("username"),
                "text", actor.get("author") + " comecou a seguir sua garagem.",
                "read", false,
                "createdAt", FieldValue.serverTimestamp()))
        .get();
  }

  public void markNotificationsRead(String userId) throws Exception {
    WriteBatch batch = firestore.batch();
    for (DocumentSnapshot snapshot : userNotifications(userId).get().get().getDocuments()) {
      if (!Boolean.TRUE.equals(snapshot.get("read"))) {
        batch.update(snapshot.getReference(), "read", true);
      }
    }
    batch.commit().get();
  }

  private void reserveUsername(String username, String userId) throws Exception {
    String normalized = EngineNormalizer.normalizeUsername(username);
    if (normalized.isBlank()) return;

    DocumentReference usernameRef = firestore.collection(USERNAMES).document(EngineNormalizer.usernameDocId(normalized));
    firestore
        .runTransaction(
            transaction -> {
              DocumentSnapshot snapshot = transaction.get(usernameRef).get();
              String owner = snapshot.exists() ? snapshot.getString("userId") : null;
              if (owner != null && !owner.equals(userId)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Este usuário já está em uso.");
              }
              transaction.set(
                  usernameRef,
                  Map.of("username", normalized, "userId", userId, "updatedAt", FieldValue.serverTimestamp()));
              return null;
            })
        .get();
  }

  private void syncCommunityProfile(String userId, Map<String, Object> settings) throws Exception {
    Map<String, Object> profile = EngineNormalizer.profileSnapshot(settings, userId);
    WriteBatch batch = firestore.batch();
    List<QueryDocumentSnapshot> docs =
        firestore.collection(COMMUNITY).whereEqualTo("ownerId", userId).get().get().getDocuments();
    for (QueryDocumentSnapshot snapshot : docs) {
      batch.update(
          snapshot.getReference(),
          Map.of(
              "author", profile.get("author"),
              "username", profile.get("username"),
              "avatar", profile.get("avatar"),
              "avatarInitials", profile.get("avatarInitials"),
              "city", profile.get("city"),
              "note", profile.get("note"),
              "updatedAt", FieldValue.serverTimestamp()));
    }
    if (!docs.isEmpty()) {
      batch.commit().get();
    }
  }

  private void syncCommunityCar(String userId, Map<String, Object> car) throws Exception {
    String carId = String.valueOf(car.get("id"));
    List<DocumentReference> goalRefs =
        List.of(
            firestore.collection(COMMUNITY).document("goal-" + userId + "-" + carId),
            firestore.collection(COMMUNITY).document("goal-" + userId + "-user-" + carId));
    Map<String, Object> patch = new LinkedHashMap<>();
    patch.put("carId", carId);
    patch.put("title", (String.valueOf(car.get("brand")) + " " + String.valueOf(car.get("model"))).trim());
    patch.put("brand", car.get("brand"));
    patch.put("model", car.get("model"));
    patch.put("year", car.get("year"));
    patch.put("image", car.get("image"));
    patch.put("savedValue", car.get("savedValue"));
    patch.put("targetValue", car.get("targetValue"));
    patch.put("updatedAt", FieldValue.serverTimestamp());

    WriteBatch batch = firestore.batch();
    boolean hasUpdates = false;
    for (DocumentReference goalRef : goalRefs) {
      if (goalRef.get().get().exists()) {
        batch.update(goalRef, patch);
        hasUpdates = true;
      }
    }
    if (hasUpdates) {
      batch.commit().get();
    }
  }

  private void syncPublicProfile(String userId, Map<String, Object> settings) throws Exception {
    firestore.collection(PUBLIC_PROFILES).document(userId).set(publicProfilePayload(userId, settings), SetOptions.merge()).get();
  }

  private Map<String, Object> readPublicProfile(String userId) throws Exception {
    DocumentSnapshot snapshot = firestore.collection(PUBLIC_PROFILES).document(userId).get().get();
    if (snapshot.exists()) {
      return FirestoreMapper.withId(snapshot);
    }

    Map<String, Object> settings = getSettings(userId);
    Map<String, Object> profile = publicProfilePayload(userId, settings);
    firestore.collection(PUBLIC_PROFILES).document(userId).set(profile, SetOptions.merge()).get();
    profile.put("id", userId);
    return profile;
  }

  private Map<String, Object> publicProfilePayload(String userId, Map<String, Object> settings) {
    Map<String, Object> snapshot = EngineNormalizer.profileSnapshot(settings, userId);
    return new LinkedHashMap<>(
        Map.of(
            "id", userId,
            "userId", userId,
            "author", snapshot.get("author"),
            "username", snapshot.get("username"),
            "avatar", snapshot.get("avatar"),
            "avatarInitials", snapshot.get("avatarInitials"),
            "city", snapshot.get("city"),
            "note", snapshot.get("note"),
            // Capa só no perfil público, igual ao front (buildPublicProfile).
            "banner", EngineNormalizer.string(EngineNormalizer.mutableMap(settings.get("profile")).get("banner")),
            "updatedAt", FieldValue.serverTimestamp()));
  }

  private void notifyOwner(String actorId, Map<String, Object> goalData, String type, String action) throws Exception {
    String ownerId = String.valueOf(goalData.get("ownerId"));
    if (ownerId.isBlank() || ownerId.equals(actorId)) return;

    Map<String, Object> actor = EngineNormalizer.profileSnapshot(getSettings(actorId), actorId);
    String goalTitle = String.valueOf(goalData.getOrDefault("title", "sua meta"));
    userNotifications(ownerId)
        .add(
            Map.of(
                "type", type,
                "actorId", actorId,
                "recipientId", ownerId,
                "actorName", actor.get("author"),
                "actorUsername", actor.get("username"),
                "goalId", goalData.get("id"),
                "goalTitle", goalTitle,
                "text", actor.get("author") + action + goalTitle + ".",
                "read", false,
                "createdAt", FieldValue.serverTimestamp()))
        .get();
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> normalizeCommunityGoal(Map<String, Object> goal, String userId) {
    Map<String, Object> ratingsBy = EngineNormalizer.mutableMap(goal.get("ratingsBy"));
    double rating =
        ratingsBy.values().stream().mapToDouble(EngineNormalizer::positiveNumber).filter(value -> value > 0).average().orElse(0);
    Map<String, Object> likesBy = EngineNormalizer.mutableMap(goal.get("likesBy"));
    List<Object> comments = goal.get("comments") instanceof List<?> list ? new ArrayList<>(list.stream().limit(10).toList()) : List.of();
    String author = EngineNormalizer.string(goal.get("author")).isBlank() ? "Usuário Engine" : EngineNormalizer.string(goal.get("author"));

    Map<String, Object> normalized = new LinkedHashMap<>();
    normalized.put("id", goal.get("id"));
    normalized.put("ownerId", goal.get("ownerId"));
    normalized.put("carId", goal.get("carId"));
    normalized.put("author", author);
    normalized.put("username", EngineNormalizer.string(goal.get("username")).isBlank() ? "@engine" : goal.get("username"));
    normalized.put("avatar", EngineNormalizer.string(goal.get("avatar")).isBlank() ? goal.getOrDefault("avatarInitials", "") : goal.get("avatar"));
    normalized.put("city", EngineNormalizer.string(goal.get("city")).isBlank() ? "Engine Garage" : goal.get("city"));
    normalized.put("title", EngineNormalizer.string(goal.get("title")).isBlank() ? (EngineNormalizer.string(goal.get("brand")) + " " + EngineNormalizer.string(goal.get("model"))).trim() : goal.get("title"));
    normalized.put("brand", goal.get("brand"));
    normalized.put("model", goal.get("model"));
    normalized.put("year", goal.get("year"));
    normalized.put("savedValue", EngineNormalizer.positiveNumber(goal.get("savedValue")));
    normalized.put("targetValue", EngineNormalizer.positiveNumber(goal.get("targetValue")));
    normalized.put("streak", EngineNormalizer.positiveNumber(goal.getOrDefault("streak", 1)));
    normalized.put("likes", likesBy.size());
    normalized.put("comments", comments);
    normalized.put("rating", rating);
    normalized.put("tagKey", "community.seed.mine");
    normalized.put("noteKey", EngineNormalizer.string(goal.get("note")).isBlank() ? "community.seed.mineNote" : null);
    normalized.put("isMine", userId.equals(goal.get("ownerId")));
    normalized.put("likesBy", likesBy);
    normalized.put("ratingsBy", ratingsBy);
    normalized.put("createdAt", goal.get("createdAt"));
    normalized.put("updatedAt", goal.get("updatedAt"));
    return normalized;
  }

  private DocumentReference userDoc(String userId) {
    return firestore.collection(USERS).document(userId);
  }

  private com.google.cloud.firestore.CollectionReference userCars(String userId) {
    return userDoc(userId).collection("cars");
  }

  private DocumentReference userCar(String userId, String carId) {
    return userCars(userId).document(carId);
  }

  private DocumentReference userSettings(String userId) {
    return userDoc(userId).collection("private").document("settings");
  }

  private DocumentReference userCommunity(String userId) {
    return userDoc(userId).collection("private").document("community");
  }

  private com.google.cloud.firestore.CollectionReference userNotifications(String userId) {
    return userDoc(userId).collection("notifications");
  }

  private static String truncate(String value, int maxLength) {
    String normalized = value == null ? "" : value.trim();
    return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
  }

  private static double progress(Map<String, Object> goal) {
    double target = EngineNormalizer.positiveNumber(goal.get("targetValue"));
    if (target <= 0) return 0;
    return Math.min((EngineNormalizer.positiveNumber(goal.get("savedValue")) / target) * 100, 100);
  }
}
