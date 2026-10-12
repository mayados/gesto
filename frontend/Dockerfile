# Image nginx « sans privilèges » : elle tourne avec un utilisateur normal, pas root,
# et écoute sur le port 8080 (un utilisateur normal ne peut pas utiliser le port 80).
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY gesto_proxy_headers.conf /etc/nginx/gesto_proxy_headers.conf

COPY html /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/"]
