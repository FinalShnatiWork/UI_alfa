# Backend

Spring Boot API for the broker. The site itself is the React app in `UI-react` and runs on port **3001**. This process listens on port **8080**.

From the repository root, `start-project.bat` starts PostgreSQL, this API, and the React app together. To run the API alone:

```powershell
cd backend
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=postgres"
```

PostgreSQL is the Docker database from the root `docker-compose.yml` (host port 5433). The default profile in `application.yml` is `postgres`.
