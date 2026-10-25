# Appointments API

A small API for booking appointments. `npm start` runs it on port 3000, and
`npm test` runs the tests (one of them fails today).

## Routes

- `GET /appointments?from=<iso time>`
- `POST /appointments` with `{ who, start, end }`
- `DELETE /appointments/:id`

## To do

- Overlapping appointments are allowed.
- No pagination on the list.
- No `/health` endpoint.
- Appointments are lost on restart.
