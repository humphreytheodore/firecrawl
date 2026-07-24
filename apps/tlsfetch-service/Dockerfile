FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

ENV PORT=3005
EXPOSE 3005

# gunicorn: the fetches are IO-bound, so threads are the right knob.
CMD ["gunicorn", "-b", "0.0.0.0:3005", "-w", "2", "--threads", "8", "-t", "120", "app:app"]
