import express from "express";
import cors from "cors";

const server = express();
const PORT = 3000;

server.listen(PORT, () => {
  console.log("listening on", PORT);
});
