import "dotenv/config";
import { createApp } from "./src/app.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const app = await createApp();

app.listen(port, host, () => {
  console.log(`Servidor listo en http://${host}:${port}`);
});
