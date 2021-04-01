# click-and-collect
Click and collect is the implementation for our P2 project, this is able to coordinate the selection of timeslots and assign a specific queue to each customer

## Requirements
* Node 15.12.0

## To run
* Run `npm install` in the directory "backend". You only have to do this once when you download/update the repository.
* Run `node backend/server.js` in the root directory of the repository. This will setup an empty sqlite3 database in the root directory called `databasen.sqlite3`. 

## Helpful tasks
### Test environment
To install a test environment for the database, you have to use "db browser for sqlite3", 
or an equivalent sqlite3 editor, open `databasen.sqlite3` and run the commands in `backend/create_test_user.sql`
