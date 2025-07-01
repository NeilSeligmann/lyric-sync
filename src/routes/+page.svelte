<script lang="ts">
  import type { PageData } from "./$types";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  const { data }: { data: PageData } = $props();

  let username = $state("");
  let password = $state("");
  let error = $state("");

  // If auth is enabled but user is not authenticated, show login form
  const showLoginForm = $derived(data.auth && !data.auth.authenticated);

  async function handleLogin() {
    if (!username || !password) {
      error = "Please enter both username and password";
      return;
    }

    try {
      // Create Basic Auth header
      const credentials = btoa(`${username}:${password}`);
      const response = await fetch(window.location.href, {
        headers: {
          "Authorization": `Basic ${credentials}`,
        },
      });

      if (response.ok) {
        // Store credentials in sessionStorage for future requests
        sessionStorage.setItem("auth_credentials", credentials);
        // Reload the page to apply the new auth
        window.location.reload();
      } else {
        error = "Invalid username or password";
      }
    } catch (err) {
      error = "Login failed. Please try again.";
      console.error("Login error:", err);
    }
  }

  onMount(() => {
    // If we have stored credentials, try to use them
    const storedCredentials = sessionStorage.getItem("auth_credentials");
    if (storedCredentials && !data.auth?.authenticated) {
      // Try to authenticate with stored credentials
      fetch(window.location.href, {
        headers: {
          "Authorization": `Basic ${storedCredentials}`,
        },
      }).then(response => {
        if (!response.ok) {
          // Clear invalid credentials
          sessionStorage.removeItem("auth_credentials");
        }
      });
    }
  });
</script>

{#if showLoginForm}
  <div class="min-h-screen flex items-center justify-center bg-surface-50-950">
    <div class="card p-8 w-full max-w-md">
      <div class="text-center mb-6">
        <h1 class="text-2xl font-bold mb-2">Lyric Sync</h1>
        <p class="text-surface-600-400">Please log in to continue</p>
      </div>

      <form on:submit|preventDefault={handleLogin} class="space-y-4">
        <div>
          <label for="username" class="block text-sm font-medium mb-1">Username</label>
          <input
            id="username"
            type="text"
            bind:value={username}
            class="input w-full"
            placeholder="Enter username"
            required
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium mb-1">Password</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            class="input w-full"
            placeholder="Enter password"
            required
          />
        </div>

        {#if error}
          <div class="p-3 bg-red-100 text-red-700 rounded text-sm">
            {error}
          </div>
        {/if}

        <button type="submit" class="btn btn-filled w-full">
          Log In
        </button>
      </form>
    </div>
  </div>
{:else}
  <!-- Original page content -->
  <div class="container mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">Welcome to Lyric Sync</h1>
    
    {#if data.auth?.authenticated && data.auth.username}
      <div class="mb-4 p-3 bg-green-100 text-green-700 rounded">
        Logged in as: <strong>{data.auth.username}</strong>
      </div>
    {/if}

    {#if data.serverConfiguration}
      <div class="card p-4 mb-4">
        <h2 class="text-lg font-semibold mb-2">Server Configuration</h2>
        <p><strong>Server:</strong> {data.serverConfiguration.serverName}</p>
        <p><strong>Host:</strong> {data.serverConfiguration.hostname}:{data.serverConfiguration.port}</p>
      </div>

      {#if data.libraries && data.libraries.length > 0}
        <div class="card p-4">
          <h2 class="text-lg font-semibold mb-2">Available Libraries</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each data.libraries as library}
              {#if library.key !== "hide_me"}
                <div class="p-3 border rounded">
                  <h3 class="font-medium">{library.title}</h3>
                  <p class="text-sm text-surface-600-400">Library</p>
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {:else}
        <div class="card p-4">
          <p class="text-surface-600-400">No libraries found. Please configure your Plex server first.</p>
        </div>
      {/if}
    {:else}
      <div class="card p-4">
        <h2 class="text-lg font-semibold mb-2">Setup Required</h2>
        <p class="mb-4">No server configuration found. Please add a Plex server to get started.</p>
        <a href="/add-server" class="btn btn-filled">Add Server</a>
      </div>
    {/if}
  </div>
{/if}
