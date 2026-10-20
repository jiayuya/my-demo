import fs from "fs";
import path from "path";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const geojsonDir = path.resolve(process.cwd(), "public/geojson");

function listGeoJsonFiles() {
  if (!fs.existsSync(geojsonDir)) return [];
  return fs
    .readdirSync(geojsonDir)
    .filter((name) => name.toLowerCase().endsWith(".geojson"))
    .sort();
}

function geojsonManifest(): Plugin {
  const serveIndex: Connect.NextHandleFunction = (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(listGeoJsonFiles()));
  };

  return {
    name: "geojson-manifest",
    configureServer(server) {
      server.middlewares.use("/geojson/index.json", serveIndex);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/geojson/index.json", serveIndex);
    },
    closeBundle() {
      const outDir = path.resolve(process.cwd(), "dist/geojson");
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(listGeoJsonFiles()));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    minify: "terser",
    terserOptions: {
      // 清除console和debugger
      compress: {
        // drop_console 暂时不能用，会报错
        // https://github.com/Ezviz-OpenBiz/EZUIKit-JavaScript-npm/issues/138
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
  plugins: [vue(), geojsonManifest()],
  server: {
    proxy: {
      '/api/admin': {
        target: 'https://map.ruiduobao.com',
        changeOrigin: true,

        rewrite: (path) => {
          return path.replace(
            /^\/api\/admin/,
            ''
          )
        }
      }
    }
  }
});
