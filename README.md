# click-and-collect
Click and collect is the implementation for our P2 project, this is able to coordinate the selection of timeslots and assign a specific queue to each customer

## Requirements
* Node 16.0.0

## To run
* Run `npm install` in the directory "backend". You only have to do this once when you download/update the repository.
* Run `node backend/download-external-dependencies.js`, this will download the required external dependencies for the frontend.
* Run `node demoenv.js`, this will create some stores and admins which will allow you to test things.
* Run `node backend/server-runner.js` in the root directory of the repository, this will run the server. 

## Users created by `demoenv.js`
Demoenv creates two stores with some users for each. The users are listed below
| username      | password       | store name         | Role     |
|---------------|----------------|--------------------|----------|
| adamwest      | adminWest1     | Northern Ecommerce | Admin    |
| fionajohnson  | fJohnson12     | Northern Ecommerce | Employee |
| amandaeast    | adminEast1     | Southern Ecommerce | Admin    |
| michaelbagger | mBagger13      | Southern Ecommerce | Employee |

## Important notes
Time slots are not created when there are no queues, this is becauase each timeslot needs a queue. Therefore, to create timeslots there needs to be atleast one queue for the store. To add a queue, you need to use the admin webpage, eg. you need to run the server and login as an admin. From there you can create the timeslots
