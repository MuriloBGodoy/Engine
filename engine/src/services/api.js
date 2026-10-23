import { auth } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";

async function getAuthToken() {
  if (!auth.currentUser) return null;
  return await auth.currentUser.getIdToken(true);
}

export const api = {
  async request(endpoint, options = {}) {
    const token = await getAuthToken();
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `API Error: ${response.status}`);
    }

    return response.json();
  },

  // FIPE (Public)
  fipe: {
    async getBrands() {
      return api.request("/fipe/brands");
    },
    async getModels(brandId) {
      return api.request(`/fipe/brands/${brandId}/models`);
    },
    async getYears(brandId, modelId) {
      return api.request(`/fipe/brands/${brandId}/models/${modelId}/years`);
    },
    async getPrice(brandId, modelId, yearId) {
      return api.request(`/fipe/brands/${brandId}/models/${modelId}/years/${yearId}/price`);
    },
  },

  // Cars (Auth required)
  cars: {
    async list() {
      return api.request("/cars");
    },
    async save(car) {
      return api.request("/cars", {
        method: "POST",
        body: JSON.stringify(car),
      });
    },
    async delete(carId) {
      return api.request(`/cars/${carId}`, { method: "DELETE" });
    },
    async reset() {
      return api.request("/cars", { method: "DELETE" });
    },
  },

  // Community (Auth required)
  community: {
    async getState() {
      return api.request("/community/state");
    },
    async saveState(state) {
      return api.request("/community/state", {
        method: "PUT",
        body: JSON.stringify(state),
      });
    },
    async getGoals() {
      return api.request("/community/goals");
    },
    async getPublicProfile(userId) {
      return api.request(`/community/users/${userId}`);
    },
    async shareGoal(goal) {
      return api.request("/community/goals", {
        method: "POST",
        body: JSON.stringify(goal),
      });
    },
    async deleteGoal(goalId) {
      return api.request(`/community/goals/${goalId}`, { method: "DELETE" });
    },
    async deleteAllGoals() {
      return api.request("/community/goals", { method: "DELETE" });
    },
    async toggleLike(goalId, liked) {
      return api.request(`/community/goals/${goalId}/like`, {
        method: "PATCH",
        body: JSON.stringify({ liked }),
      });
    },
    async addComment(goalId, comment) {
      return api.request(`/community/goals/${goalId}/comments`, {
        method: "POST",
        body: JSON.stringify({ comment }),
      });
    },
    async rateGoal(goalId, rating) {
      return api.request(`/community/goals/${goalId}/rating`, {
        method: "PATCH",
        body: JSON.stringify({ rating }),
      });
    },
    async notifyFollow(userId) {
      return api.request(`/community/users/${userId}/follow`, { method: "POST" });
    },
  },

  // Settings (Auth required)
  settings: {
    async get() {
      return api.request("/settings");
    },
    async save(settings) {
      return api.request("/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
    },
    async reset() {
      return api.request("/settings", { method: "DELETE" });
    },
  },

  // Notifications (Auth required)
  notifications: {
    async list() {
      return api.request("/notifications");
    },
    async markAsRead() {
      return api.request("/notifications/read", { method: "PATCH" });
    },
  },
};
