# Estágio 1: Build (Usamos o Node apenas para compilar o Astro)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Estágio 2: Produção (Usamos o Nginx para servir os arquivos estáticos)
FROM nginx:alpine
# Copiamos os arquivos compilados da pasta dist para a pasta pública do Nginx
COPY --from=build /app/dist /usr/share/nginx/html
# O Nginx roda internamente na porta 80
EXPOSE 80
# Inicia o Nginx
CMD ["nginx", "-g", "daemon off;"]
