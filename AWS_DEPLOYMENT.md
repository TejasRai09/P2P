# AWS Deployment Guide

This app is set up to run as a single container that serves both the React frontend and the Node/MySQL API.

## Recommended AWS layout

- Amazon RDS MySQL for the database
- Amazon ECS Fargate or AWS App Runner for the container
- An Application Load Balancer in front of the service

## Environment variables

Set these in the AWS service configuration or secrets manager:

- `NODE_ENV=production`
- `PORT=3000`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `OUTLOOK_USER`
- `OUTLOOK_PASS`

## Health check

Use `GET /healthz` for the load balancer or service health check.

## Build and run locally with Docker

```bash
docker build -t z-track .
docker run --rm -p 3000:3000 --env-file .env z-track
```

## Suggested AWS flow

1. Create an RDS MySQL database and allow inbound traffic from the app service security group.
2. Build the Docker image locally or in CI.
3. Push the image to Amazon ECR.
4. Deploy the image to ECS Fargate or App Runner.
5. Set the environment variables above using AWS Secrets Manager or the service configuration.
6. Point the health check to `/healthz`.

## Notes

- The frontend and API share the same origin, so no separate API base URL is needed.
- The server now fails fast if production database settings are missing.
- Ticket creation sends notification emails to the department address and the admin mailbox.
- Update the seeded demo credentials before exposing the app to real users.
