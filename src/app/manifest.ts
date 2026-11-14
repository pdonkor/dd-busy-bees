import type { MetadataRoute } from "next";

/** Lets staff and parents add the app to their phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DD Busy Bees",
    short_name: "Busy Bees",
    description: "School app for DD Busy Bees Montessori",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#f59e0b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
