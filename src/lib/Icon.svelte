<script lang="ts">
  export let name: "bucket" | "folder" | "file" | "trash" | "upload" | "left" | "right" | "updown" | "check" | "plus" | "edit" | "theme" | "search" | "close";
  export let size = 16;
  export let color = "var(--text)";
</script>

<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === "bucket"}
    <path d="M3 4.5l1 8.5h8l1-8.5" /><ellipse cx="8" cy="4.5" rx="5" ry="1.8" />
  {:else if name === "folder"}
    <path d="M2 4.5A1.5 1.5 0 013.5 3H6l1.5 1.5h5A1.5 1.5 0 0114 6v6.5A1.5 1.5 0 0112.5 14h-9A1.5 1.5 0 012 12.5z" />
  {:else if name === "file"}
    <path d="M4 2h5.5L13 5.5V14H4z" /><path d="M9.5 2v3.5H13" />
  {:else if name === "trash"}
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" />
  {:else if name === "upload"}
    <path d="M8 12V4M4.5 7.5L8 4l3.5 3.5" stroke-width="1.6" />
  {:else if name === "left"}
    <path d="M10 3L5 8l5 5" stroke-width="1.6" />
  {:else if name === "right"}
    <path d="M6 3l5 5-5 5" stroke-width="1.6" />
  {:else if name === "updown"}
    <path d="M5 6l3-3 3 3M5 10l3 3 3-3" stroke-width="1.6" />
  {:else if name === "check"}
    <path d="M3.5 8.5l3 3 6-6" stroke-width="1.8" />
  {:else if name === "plus"}
    <path d="M8 3v10M3 8h10" stroke-width="1.6" />
  {:else if name === "theme"}
    <circle cx="8" cy="8" r="5.5" /><path d="M8 2.5a5.5 5.5 0 010 11z" fill={color} stroke="none" />
  {:else if name === "search"}
    <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" stroke-width="1.6" />
  {:else if name === "close"}
    <path d="M4 4l8 8M12 4l-8 8" stroke-width="1.6" />
  {:else if name === "edit"}
    <path d="M11 2.5l2.5 2.5L6 12.5H3.5V10z" />
  {/if}
</svg>
