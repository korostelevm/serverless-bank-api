# vendia-bank

This application allows users to manage and transfer funds between different accounts. It supports operations such as retrieving account balances and transferring funds between accounts.




## Development

#### Prerequisites
- aws-cli, aws-sam-cli, Node v20 
- Authenticated into an AWS account

Makefile is used to manage the build and deployment process of a Serverless Application Model (SAM) application. 

Here's a brief description of each target:

### `init`
Deploys the base infrastructure for the application using the AWS SAM CLI (an s3 bucket for deploying application code). It also installs the necessary dependencies using npm.

### `install`
This target installs the necessary dependencies using npm.

### `test`
Run end-to-end tests using jest.

### `build`
Builds the application using the AWS SAM CLI. It uses caching to speed up the build process.

### `deploy`
Deploys the application using the AWS SAM CLI. It retrieves the application bucket name from the base infrastructure stack and uses it for deployment.

### `dev`
Runs the application in development mode using the AWS SAM CLI. It watches for changes and syncs them to the running application.

## Usage
To use the application, users need to authenticate and then they can perform operations like:

- Retrieve the initial payroll balance
- Transfer funds between named accounts


### Database
This project uses a single table DynamoDB schema to store all its data. Both the BalanceFunction and TransfersFunction are given CRUD (Create, Read, Update, Delete) permissions to the same DynamoDB table, referred to as DB in the `template.yaml`.

With single table design, multiple item types are stored in the same table and are distinguished by their key schema.

LSI and GSI and indexes and associated attributes are reserved but not used for this project.

### Authentication


### POST /transfer

This endpoint is used to transfer funds between different accounts.

#### Request Body

- `amount`: The amount of money to be transferred.
- `source_account_name`: The name of the account from which the funds will be transferred.
- `destination_account_name`: The name of the account to which the funds will be transferred.
- `partner`: The email of the partner involved in the transfer.

#### Response

The response will be a JSON object with the status of the transfer.

#### Example

```js
let payload = {
  amount: 1,
  source_account_name: 'payroll',
  destination_account_name: 'savings',
  partner: 'test_user@test.com'
}
// for an authenticated client
let r = await client.post(apiUrl + '/transfer', payload)
```


### GET /balance/{account}
This endpoint is used to retrieve the balance of a specific account.

#### Path Parameters
- `account`: The name of the account for which the balance will be retrieved.
#### Response
The response will be a JSON object with the name of the account and its balance.

#### Example
```js
// for an authenticated client
let r = await client.get(apiUrl + '/balance/payroll')
```

## Tests
An end to end test to verify api functions is specified in `test/e2e.test.mjs`.

- end to end test only depend on infrastructure being provisioned.
- two cognito users are created for the tests, deleted after tests
- database state (account balances, user roles) is reset before and after tests


#### anonymous user
- ✓ fails to call balance endpoint without token 
- ✓ fails to call transfers endpoint without token 

#### registered user
- ✓ gets a jwt token from cognito
- ✓ retrieves initial payroll balance 
- ✓ fails to transfers 1 dollar from other user's special account 
- ✓ transfers 1 dollar from payroll to savings
- ✓ transfers 1 dollar from payroll to savings 10 times concurrently 
- ✓ transfers 1 dollar from opex to other partner's savings
- ✓ fails to transfers 1 dollar from opex to unknown partner's savings
- ✓ fails to transfers 1,000,000 dollars from opex to other partner's savings