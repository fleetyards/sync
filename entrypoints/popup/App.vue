<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { fetchRsiStatus, type RsiStatus } from "@/lib/status";
import { RSI_BASE_URL } from "@/lib/rsi";

const version = browser.runtime.getManifest().version;
const rsi = ref<RsiStatus | null>(null);

const rsiLabel = computed(() => {
  switch (rsi.value?.state) {
    case "signed-in":
      return rsi.value.handle;
    case "signed-out":
      return "Not signed in";
    case "error":
      return "Unavailable";
    default:
      return "Checking…";
  }
});

async function refresh() {
  rsi.value = null;
  rsi.value = await fetchRsiStatus((message) =>
    browser.runtime.sendMessage(message)
  );
}

onMounted(refresh);
</script>

<template>
  <main class="panel">
    <header>
      <img src="/icon/48.png" alt="" width="24" height="24" />
      <h1>Fleetyards Sync</h1>
      <span class="version">v{{ version }}</span>
    </header>

    <dl>
      <div class="row">
        <dt>RSI account</dt>
        <dd :class="rsi?.state">
          <span class="dot" />
          {{ rsiLabel }}
        </dd>
      </div>
    </dl>

    <footer>
      <a
        v-if="rsi?.state === 'signed-out'"
        class="btn"
        :href="`${RSI_BASE_URL}/connect`"
        target="_blank"
      >
        Sign in to RSI
      </a>
      <button type="button" class="btn" @click="refresh">Refresh</button>
    </footer>
  </main>
</template>

<style>
@font-face {
  font-family: "Open Sans";
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url("@/assets/fonts/open-sans-latin.woff2") format("woff2");
}

@font-face {
  font-family: "Orbitron";
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
  src: url("@/assets/fonts/orbitron-latin.woff2") format("woff2");
}

:root {
  color-scheme: dark;
  --bg: #272b30;
  --text: #c8c8c8;
  --text-dim: #959595;
  --lifted: #eee;
  --primary: #428bca;
  --success: #5cb85c;
  --danger: #dc3545;
  --pending: #52575c;
  --surface: rgb(39 43 48 / 0.9);
  --control-hover: rgb(52 58 64 / 0.95);
  --control-press: rgb(26 29 33 / 0.95);
  --edge: rgb(122 130 136 / 0.5);
  --edge-faint: rgb(122 130 136 / 0.16);
  --endcap: #7a8288;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 14px/1.5 "Open Sans", sans-serif;
}

.panel {
  position: relative;
  width: 280px;
  padding: 14px 16px;
  border: 2px solid var(--edge);
}

.panel::before,
.panel::after,
.btn::before,
.btn::after {
  content: "";
  position: absolute;
  left: max(10px, 12%);
  right: max(10px, 12%);
  background: var(--endcap);
  transition: background-color 150ms;
}

.panel::before,
.panel::after {
  height: 4px;
}

.panel::before {
  top: -2px;
  border-radius: 0 0 3px 3px;
}

.panel::after {
  bottom: -2px;
  border-radius: 3px 3px 0 0;
}

header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

h1 {
  margin: 0;
  font-family: "Orbitron", sans-serif;
  font-size: 15px;
  font-weight: 500;
  color: var(--lifted);
}

.version {
  margin-left: auto;
  color: var(--text-dim);
  font-size: 12px;
}

dl {
  margin: 0;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid var(--edge-faint);
}

dt {
  color: var(--text-dim);
}

dd {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  text-align: right;
  color: var(--lifted);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pending);
  flex-shrink: 0;
}

.signed-in .dot {
  background: var(--success);
}

.signed-out .dot,
.error .dot {
  background: var(--danger);
}

footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--edge-faint);
}

.btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 29px;
  padding: 0 10px;
  margin: 0;
  font: 400 14px "Open Sans", sans-serif;
  color: var(--text);
  text-decoration: none;
  white-space: nowrap;
  background: var(--surface);
  border: 1px solid var(--edge);
  border-radius: 8px;
  cursor: pointer;
  transition:
    background-color 150ms ease-in-out,
    border-color 150ms ease-in-out,
    color 150ms ease-in-out,
    outline-color 150ms ease-in-out;
}

.btn::before,
.btn::after {
  height: 2px;
}

.btn::before {
  top: -1px;
  border-radius: 0 0 1px 1px;
}

.btn::after {
  bottom: -1px;
  border-radius: 1px 1px 0 0;
}

.btn:hover {
  background: var(--control-hover);
  color: var(--lifted);
}

.btn:hover::before,
.btn:hover::after {
  background: var(--primary);
}

.btn:active {
  background: var(--control-press);
}

.btn:active::before,
.btn:active::after {
  background: color-mix(in srgb, var(--primary) 60%, transparent);
}

.btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
</style>
