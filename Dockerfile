# FlowGraph: edytor w przeglądarce i strony przykładów jako statyczna strona (nginx, bez roota, port 8080).
#   docker build -t flowgraph .
#   docker run --rm -p 8080:8080 flowgraph     → http://localhost:8080
# Kopiuje gotowy dist/ (CI pilnuje, żeby był aktualny), więc nie ma kroków RUN i obraz buduje się
# na dowolną architekturę bez emulacji. Kubernetes: deploy/kubernetes.yaml.
FROM nginxinc/nginx-unprivileged:1.30.6-alpine-slim@sha256:5d8bb9437d74a600ec5dbf90c035451c724dc33eac8d3a71078f6f8612c345f6

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/editor.html /usr/share/nginx/html/index.html
COPY dist/examples/ /usr/share/nginx/html/examples/

EXPOSE 8080
USER 101
