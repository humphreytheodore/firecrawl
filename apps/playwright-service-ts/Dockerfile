FROM node:18-slim

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install

COPY . .

ENV PLAYWRIGHT_BROWSERS_PATH=/usr/local/share/playwright

# Install Playwright system deps + chromium, then patchright's patched driver.
# [groundcraft] playwright's --with-deps pulls the system libraries; patchright
# reuses PLAYWRIGHT_BROWSERS_PATH but ships its own de-fingerprinted driver.
RUN npx playwright install chromium --with-deps
RUN npx patchright install chromium

RUN npm run build

ARG PORT
ENV PORT=${PORT}

EXPOSE ${PORT}

CMD [ "npm", "start" ]
