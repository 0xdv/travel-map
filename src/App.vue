<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { createTravelMap, type CountryStatus } from './d3world';
import { countries, type Country, getCountryEmoji } from './countries';

interface UserProfile {
  name: string;
  emoji: string;
}

const defaultUser: UserProfile = { name: 'me', emoji: '👤' };

// Load users from localStorage or use default
const users = ref<UserProfile[]>(
  JSON.parse(localStorage.getItem('travelMapUsers') || 'null') || [defaultUser]
);

// Save users whenever they change
watch(users, (newUsers) => {
  localStorage.setItem('travelMapUsers', JSON.stringify(newUsers));
}, { deep: true });

const currentUser = ref<string>(
  localStorage.getItem('currentUser') || users.value[0].name
);

// Dialog state
const showAddUserDialog = ref(false);
const newUserName = ref('');
const newUserEmoji = ref('😀');
const availableEmojis = ['😀', '😎', '🤓', '🥳', '🤩', '😇', '🧑', '👩', '👨', '👶', '🧒', '👧', '👦', '🐱', '🐶', '🦊', '🐻', '🐼', '🦁', '🐯', '🌟', '💫', '✨', '🔥', '💎', '🎯', '🚀', '🌈'];

// Context menu state
const contextMenu = ref<{ show: boolean; x: number; y: number; userName: string }>({
  show: false,
  x: 0,
  y: 0,
  userName: ''
});

function showContextMenu(event: MouseEvent, userName: string) {
  event.preventDefault();
  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    userName
  };
}

function hideContextMenu() {
  contextMenu.value.show = false;
}

function getCurrentUserProfile(): UserProfile {
  return users.value.find(u => u.name === currentUser.value) || defaultUser;
}

function addUser() {
  if (!newUserName.value.trim()) return;
  if (users.value.some(u => u.name === newUserName.value.trim())) {
    alert('User with this name already exists');
    return;
  }
  users.value.push({ name: newUserName.value.trim(), emoji: newUserEmoji.value });
  currentUser.value = newUserName.value.trim();
  newUserName.value = '';
  newUserEmoji.value = '😀';
  showAddUserDialog.value = false;
}

function deleteUser(userName: string) {
  if (users.value.length <= 1) {
    alert('Cannot delete the last user');
    return;
  }
  if (!confirm(`Delete user "${userName}" and all their data?`)) return;
  users.value = users.value.filter(u => u.name !== userName);
  localStorage.removeItem(`countryStatuses_${userName}`);
  if (currentUser.value === userName) {
    currentUser.value = users.value[0].name;
  }
}

const chartRef = ref<HTMLElement | null>(null);
const searchQuery = ref('');
const activeFilter = ref<'all' | 'visited' | 'wishlist' | 'none'>('all');

function getStorageKey(user: string) {
  return `countryStatuses_${user}`;
}

// Load from localStorage based on current user
const countryStatuses = ref<Record<string, CountryStatus>>(
  JSON.parse(localStorage.getItem(getStorageKey(currentUser.value)) || '{}')
);

// Save current user preference
watch(currentUser, (newUser) => {
  localStorage.setItem('currentUser', newUser);
  // Load new user's data
  countryStatuses.value = JSON.parse(localStorage.getItem(getStorageKey(newUser)) || '{}');
});

// Save to localStorage whenever statuses change
watch(countryStatuses, (newVal) => {
  localStorage.setItem(getStorageKey(currentUser.value), JSON.stringify(newVal));
}, { deep: true });

const filteredCountries = computed(() => {
  let filtered = [...countries];

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(c => c.name.toLowerCase().includes(query));
  }

  // Filter by status
  if (activeFilter.value !== 'all') {
    filtered = filtered.filter(c => {
      const status = countryStatuses.value[c.id];
      if (activeFilter.value === 'visited') return status === 'visited';
      if (activeFilter.value === 'wishlist') return status === 'wishlist';
      if (activeFilter.value === 'none') return !status;
      return true;
    });
  }

  return filtered.sort((a, b) => a.name.localeCompare(b.name));
});

const stats = computed(() => {
  const visited = Object.values(countryStatuses.value).filter(s => s === 'visited').length;
  const wishlist = Object.values(countryStatuses.value).filter(s => s === 'wishlist').length;
  const total = countries.length;
  const remaining = total - visited;
  const visitedPercent = Math.round((visited / total) * 100);
  const wishlistPercent = Math.round((wishlist / total) * 100);
  const remainingPercent = Math.round((remaining / total) * 100);
  return { visited, wishlist, total, remaining, visitedPercent, wishlistPercent, remainingPercent };
});

function toggleStatus(countryId: string, status: CountryStatus) {
  if (!status) {
    // Remove country from statuses (unmark)
    delete countryStatuses.value[countryId];
    countryStatuses.value = { ...countryStatuses.value };
  } else {
    countryStatuses.value = { ...countryStatuses.value, [countryId]: status };
  }
}

function getStatusClass(countryId: string): string {
  const status = countryStatuses.value[countryId];
  if (status === 'visited') return 'visited';
  if (status === 'wishlist') return 'wishlist';
  return '';
}

let mapInstance: ReturnType<typeof createTravelMap> | null = null;

onMounted(async () => {
  if (chartRef.value) {
    mapInstance = await createTravelMap(chartRef.value, countryStatuses.value, (id, status) => {
      toggleStatus(id, status);
    });
  }
});

// Update map when statuses change
watch(countryStatuses, () => {
  if (mapInstance) {
    mapInstance.updateStatuses(countryStatuses.value);
  }
}, { deep: true });

function exportData() {
  const exportList = Object.entries(countryStatuses.value).map(([id, status]) => {
    const country = countries.find(c => c.id === id);
    return {
      id,
      code: country?.code || '',
      name: country?.name || '',
      status
    };
  });
  const data = JSON.stringify(exportList, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `travel-map-${currentUser.value}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          // Handle both array format (new) and object format (old)
          if (Array.isArray(data)) {
            const statuses: Record<string, CountryStatus> = {};
            data.forEach((item: { id: string; status: CountryStatus }) => {
              statuses[item.id] = item.status;
            });
            countryStatuses.value = statuses;
          } else {
            countryStatuses.value = data;
          }
        } catch {
          alert('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    }
  };
  input.click();
}
</script>

<template>
  <div class="app-container">
    <header class="header">
      <div class="header-top">
        <div class="title-section">
          <h1>🌍 My Travels</h1>
          <div class="user-selector">
            <button v-for="user in users" :key="user.name" :class="['user-btn', { active: currentUser === user.name }]"
              @click="currentUser = user.name" @contextmenu="showContextMenu($event, user.name)">
              {{ user.emoji }} {{ user.name }}
            </button>
            <button class="user-btn add-user-btn" @click="showAddUserDialog = true" title="Add user">
              ➕
            </button>
          </div>
        </div>
        <div class="stats-section">
          <div class="stats">
            <span class="stat visited-stat">✅ Visited: {{ stats.visited }} ({{ stats.visitedPercent }}%)</span>
            <span class="stat wishlist-stat">⭐ Wishlist: {{ stats.wishlist }} ({{ stats.wishlistPercent }}%)</span>
            <span class="stat remaining-stat">🎯 Remaining: {{ stats.remaining }} ({{ stats.remainingPercent }}%)</span>
          </div>
          <div class="io-buttons">
            <button class="io-btn" @click="importData" title="Import">⬇️ Import</button>
            <button class="io-btn" @click="exportData" title="Export">⬆️ Export</button>
          </div>
        </div>
      </div>
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-visited" :style="{ width: stats.visitedPercent + '%' }"></div>
          <div class="progress-wishlist" :style="{ width: stats.wishlistPercent + '%' }"></div>
        </div>
        <div class="progress-labels">
          <span>{{ stats.visited }}/{{ stats.total }} countries visited</span>
        </div>
      </div>
    </header>

    <div class="main-content">
      <div class="map-container">
        <div ref="chartRef" class="map"></div>
        <div class="map-legend">
          <div class="legend-item">
            <span class="legend-color visited"></span>
            <span>Visited</span>
          </div>
          <div class="legend-item">
            <span class="legend-color wishlist"></span>
            <span>Wishlist</span>
          </div>
          <div class="legend-item">
            <span class="legend-color default"></span>
            <span>Not marked</span>
          </div>
        </div>
      </div>

      <aside class="sidebar">
        <div class="search-box">
          <input v-model="searchQuery" type="text" placeholder="🔍 Search country..." class="search-input" />
        </div>

        <div class="filter-buttons">
          <button :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">
            All
          </button>
          <button :class="{ active: activeFilter === 'visited' }" @click="activeFilter = 'visited'">
            ✅ Visited
          </button>
          <button :class="{ active: activeFilter === 'wishlist' }" @click="activeFilter = 'wishlist'">
            ⭐ Wishlist
          </button>
          <button :class="{ active: activeFilter === 'none' }" @click="activeFilter = 'none'">
            Not marked
          </button>
        </div>

        <div class="countries-list">
          <div v-for="country in filteredCountries" :key="country.id"
            :class="['country-item', getStatusClass(country.id)]">
            <span class="country-emoji">{{ getCountryEmoji(country.code) }}</span>
            <span class="country-name">{{ country.name }}</span>
            <div class="country-actions">
              <button :class="{ active: countryStatuses[country.id] === 'visited' }"
                @click="toggleStatus(country.id, 'visited')" title="Visited">
                ✅
              </button>
              <button :class="{ active: countryStatuses[country.id] === 'wishlist' }"
                @click="toggleStatus(country.id, 'wishlist')" title="Want to visit">
                ⭐
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- Add User Dialog -->
    <div v-if="showAddUserDialog" class="dialog-overlay" @click.self="showAddUserDialog = false">
      <div class="dialog">
        <h2>Add New User</h2>
        <div class="dialog-field">
          <label>Name</label>
          <input v-model="newUserName" type="text" placeholder="Enter name..." class="dialog-input"
            @keyup.enter="addUser" />
        </div>
        <div class="dialog-field">
          <label>Choose Emoji</label>
          <div class="emoji-grid">
            <button v-for="emoji in availableEmojis" :key="emoji"
              :class="['emoji-btn', { selected: newUserEmoji === emoji }]" @click="newUserEmoji = emoji">
              {{ emoji }}
            </button>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="dialog-btn cancel" @click="showAddUserDialog = false">Cancel</button>
          <button class="dialog-btn confirm" @click="addUser" :disabled="!newUserName.trim()">Add User</button>
        </div>
      </div>
    </div>

    <!-- Context Menu -->
    <Teleport to="body">
      <div v-if="contextMenu.show" class="context-menu-overlay" @click="hideContextMenu"
        @contextmenu.prevent="hideContextMenu">
        <div class="context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
          <button class="context-menu-item danger" @click="deleteUser(contextMenu.userName); hideContextMenu()">
            🗑️ Delete "{{ contextMenu.userName }}"
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  height: 100vh;
  overflow: hidden;
  color: #fff;
}

.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  padding: 1rem 2rem;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.title-section {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.header h1 {
  font-size: 1.75rem;
  background: linear-gradient(90deg, #00d9ff, #00ff88);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.user-selector {
  display: flex;
  gap: 0.5rem;
}

.user-btn {
  padding: 0.4rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.3s;
  font-size: 0.9rem;
}

.user-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.user-btn.active {
  background: linear-gradient(90deg, rgba(0, 217, 255, 0.3), rgba(0, 255, 136, 0.3));
  border-color: #00d9ff;
  color: #fff;
}

.add-user-btn {
  padding: 0.4rem 0.6rem !important;
}

/* Dialog Styles */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.dialog {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  padding: 1.5rem;
  min-width: 320px;
  max-width: 400px;
}

.dialog h2 {
  margin-bottom: 1.5rem;
  font-size: 1.25rem;
  color: #fff;
}

.dialog-field {
  margin-bottom: 1.25rem;
}

.dialog-field label {
  display: block;
  margin-bottom: 0.5rem;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
}

.dialog-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 1rem;
  outline: none;
}

.dialog-input:focus {
  border-color: #00d9ff;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.5rem;
}

.emoji-btn {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 1.25rem;
  cursor: pointer;
  transition: all 0.2s;
}

.emoji-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: scale(1.1);
}

.emoji-btn.selected {
  background: rgba(0, 217, 255, 0.3);
  border-color: #00d9ff;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.dialog-btn {
  padding: 0.6rem 1.25rem;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.dialog-btn.cancel {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.7);
}

.dialog-btn.cancel:hover {
  background: rgba(255, 255, 255, 0.1);
}

.dialog-btn.confirm {
  background: linear-gradient(90deg, #00d9ff, #00ff88);
  border: none;
  color: #1a1a2e;
  font-weight: 600;
}

.dialog-btn.confirm:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 217, 255, 0.3);
}

.dialog-btn.confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Context Menu Styles */
.context-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2000;
}

.context-menu {
  position: fixed;
  background: linear-gradient(135deg, #2a2a3e 0%, #1e2540 100%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 0.25rem;
  min-width: 160px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 2001;
}

.context-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #fff;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s;
  text-align: left;
}

.context-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.context-menu-item.danger {
  color: #ff6b6b;
}

.context-menu-item.danger:hover {
  background: rgba(255, 107, 107, 0.15);
}

.io-btn {
  padding: 0.3rem 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.75rem;
  opacity: 0.6;
  color: #fff;
}

.io-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  opacity: 1;
}

.io-buttons {
  display: flex;
  gap: 0.3rem;
}

.stats-section {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.4rem;
}

.stats {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.stat {
  padding: 0.4rem 0.8rem;
  border-radius: 20px;
  font-weight: 500;
  font-size: 0.9rem;
}

.visited-stat {
  background: rgba(76, 175, 80, 0.2);
  border: 1px solid rgba(76, 175, 80, 0.5);
}

.wishlist-stat {
  background: rgba(255, 193, 7, 0.2);
  border: 1px solid rgba(255, 193, 7, 0.5);
}

.remaining-stat {
  background: rgba(156, 163, 175, 0.2);
  border: 1px solid rgba(156, 163, 175, 0.5);
}

.progress-container {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.progress-bar {
  flex: 1;
  height: 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  max-width: 600px;
}

.progress-visited {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #66bb6a);
  transition: width 0.5s ease;
}

.progress-wishlist {
  height: 100%;
  background: linear-gradient(90deg, #ffc107, #ffca28);
  transition: width 0.5s ease;
}

.progress-labels {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  gap: 1rem;
  padding: 1rem;
}

.map-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.map {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  min-height: 0;
}

.map svg {
  width: 100%;
  height: 100%;
}

.map-legend {
  display: flex;
  justify-content: center;
  gap: 2rem;
  padding: 0.5rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.legend-color {
  width: 20px;
  height: 20px;
  border-radius: 4px;
}

.legend-color.visited {
  background: #4caf50;
}

.legend-color.wishlist {
  background: #ffc107;
}

.legend-color.default {
  background: #4a5568;
}

.sidebar {
  width: 340px;
  min-width: 300px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-box {
  padding: 1rem;
}

.search-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 1rem;
  outline: none;
  transition: background 0.3s;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.search-input:focus {
  background: rgba(255, 255, 255, 0.15);
}

.filter-buttons {
  display: flex;
  gap: 0.5rem;
  padding: 0 1rem 1rem;
  flex-wrap: wrap;
}

.filter-buttons button {
  padding: 0.5rem 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 0.85rem;
}

.filter-buttons button:hover {
  background: rgba(255, 255, 255, 0.1);
}

.filter-buttons button.active {
  background: rgba(0, 217, 255, 0.3);
  border-color: #00d9ff;
}

.countries-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 0.5rem 1rem;
}

.countries-list::-webkit-scrollbar {
  width: 6px;
}

.countries-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
}

.countries-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.country-item {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  margin-bottom: 0.25rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  transition: all 0.3s;
}

.country-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.country-item.visited {
  background: rgba(76, 175, 80, 0.15);
  border-left: 3px solid #4caf50;
}

.country-item.wishlist {
  background: rgba(255, 193, 7, 0.15);
  border-left: 3px solid #ffc107;
}

.country-emoji {
  font-size: 1.5rem;
  margin-right: 0.75rem;
}

.country-name {
  flex: 1;
  font-weight: 500;
}

.country-actions {
  display: flex;
  gap: 0.5rem;
}

.country-actions button {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.3s;
  font-size: 1rem;
  opacity: 0.5;
}

.country-actions button:hover {
  opacity: 1;
  transform: scale(1.1);
}

.country-actions button.active {
  opacity: 1;
  background: rgba(255, 255, 255, 0.2);
}

/* Large screens */
@media (min-width: 1600px) {
  .main-content {
    gap: 1.5rem;
    padding: 1rem 1.5rem;
  }

  .sidebar {
    width: 400px;
  }
}

@media (max-width: 900px) {
  .main-content {
    flex-direction: column;
    padding: 0.5rem;
  }

  .header {
    flex-direction: column;
    align-items: flex-start;
  }

  .sidebar {
    width: 100%;
    max-height: 50vh;
    min-width: unset;
    border-radius: 16px 16px 0 0;
  }

  .map-container {
    min-height: 50vh;
    max-width: none;
  }

  .map {
    max-height: none;
  }
}
</style>
