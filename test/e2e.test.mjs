import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation"; // ES Modules import
import { AdminCreateUserCommand, AdminDeleteUserCommand,  AdminSetUserPasswordCommand,  CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);


import axios from "axios";

const cloudformation = new CloudFormationClient({
  region: process.env.AWS_REGION || "us-east-2",
});
const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || "us-east-2",
});

let stack;

const USERS = [{
  username: 'test_user@test.com',
  password: '12345678',
}, {
  username: 'test_user2@test.com',
  password: '434234234',
}]

const ACCOUNTS = [
  { 
    id: 'opex1',
    name: 'opex',
    balance: 100,
    partners: ['test_user@test.com']
  },
  { 
    id: 'savings1',
    name: 'savings',
    balance: 100,
    partners: ['test_user@test.com']
  },
  { 
    id: 'payroll1',
    name: 'payroll',
    balance: 100,
    partners: ['test_user@test.com']
  },
  { 
    id: 'opex2',
    name: 'opex',
    balance: 0,
    partners: ['test_user2@test.com']
  },
  { 
    id: 'savings2',
    name: 'savings',
    balance: 0,
    partners: ['test_user2@test.com']
  },
  { 
    id: 'payroll2',
    name: 'payroll',
    balance: 0,
    partners: ['test_user2@test.com']
  },
]

/*
  1. get stack outputs with cloudformation
  2. setup user accounts for the test
  3. init account balances
*/

const reset_accounts = async () => {
    // init account balances and partner records in dynamodb

    let init_accounts = ACCOUNTS.map(async (account) => {

      let account_record = {
        pk: account.id,
        sk: account.id,
        name: account.name,
        balance: account.balance,
        last_modified: new Date().toISOString()
      }

      await docClient.send(new PutCommand({
        TableName: stack.DB,
        Item: account_record,
      }))
      
      let partner_records = account.partners.map(async (partner) => {
        let partner_record = {
            pk: partner,
            sk: account.id,
            account_id: account.id,
            account_name: account.name,
            role: 'owner'
        }
        
        await docClient.send(new PutCommand({
          TableName: stack.DB,
          Item: partner_record,
        }))
      })

      await Promise.all(partner_records)
    })



    await Promise.all(init_accounts)

}



beforeAll(async () => {
  // get stack output with cloudformation
  let res = await cloudformation.send(new DescribeStacksCommand( { // DescribeStacksInput
    StackName: "vendia-assessment",
  }));
  
  stack = res.Stacks[0].Outputs.reduce((acc, output) => {
    acc[output.OutputKey] = output.OutputValue;
    return acc;
  }, {})


  // create user with cognito
  let init_test_users = USERS.map(async (user) => {
      await cognito.send(new AdminCreateUserCommand({
        UserPoolId: stack.UserPool,
        Username: user.username,
        TemporaryPassword: user.password,
        MessageAction:"SUPPRESS",
        UserAttributes: [
          {
            Name: 'email',
            Value: user.username
          },
          {
            Name: "custom:username",
            Value: user.username
          },
          {
            Name: 'email_verified',
            Value: 'false'
          }
        ]
      }))
    
      // set user password
      await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: stack.UserPool,
        Username: user.username,
        Password: user.password,
        Permanent: true
      }))
  })
  
  await Promise.all(init_test_users)

  // init account balances
  await reset_accounts()

});





afterAll(async () => {
  // delete users with cognito
  let delete_test_users = USERS.map(async (user) => {
    await cognito.send(new AdminDeleteUserCommand({
      UserPoolId: stack.UserPool,
      Username: user.username,
    }))
  })

  Promise.all(delete_test_users)

  // reset account balances
  await reset_accounts()

});


describe('anonymous user', () => { 
  it('fails to call balance endpoint without token', async () => { 
    try{
      let r = await axios.get(stack.ApiUrl + '/balance/payroll')
    }catch(e){
      expect(e.response.status).toEqual(401);
    }
  });

  it('fails to call transfers endpoint without token', async () => { 
    try{
      let r = await axios.post(stack.ApiUrl + '/transfer', {
        amount: 10,
        source_account_name: 'payroll',
        destination_account_name: 'savings',
        partner: 'test_user2@test.com'
      })
    }catch(e){
      expect(e.response.status).toEqual(401);
    }
  });
})


describe('registered user', () => { 
  let token
  let clients = []

  it('gets a jwt token from cognito', async () => { 

      for (let user of USERS){
        let r = await axios.post('https://cognito-idp.us-east-2.amazonaws.com/', {
          "AuthFlow": "USER_PASSWORD_AUTH",
          "ClientId": "5lui55u51lglkg53n82ehlsv2u",
          "AuthParameters": {
            "USERNAME": user.username,
            "PASSWORD": user.password
          }
        },{
          headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
          }
        })
        expect(r.status).toEqual(200);
        expect(r.data.AuthenticationResult).toBeDefined();
        expect(r.data.AuthenticationResult.AccessToken).toBeDefined();
        token = r.data.AuthenticationResult.AccessToken
        token = r.data.AuthenticationResult.IdToken
        let client = axios.create({
          headers: {
            'Authorization': token
          }
        })
        clients.push(client)
      }


    });

    it('retrieves initial payroll balance', async () => { 
      let r = await clients[0].get(stack.ApiUrl + '/balance/payroll')
      expect(r.status).toEqual(200);
      expect(r.data.name).toEqual('payroll');
      expect(r.data.balance).toEqual(100);
    });

    
    it('transfers 1 dollar from payroll to savings', async () => { 
    
      let payload = {
        amount: 1,
        source_account_name: 'payroll',
        destination_account_name: 'savings',
        partner: 'test_user@test.com'
      }

      let r = await clients[0].post(stack.ApiUrl + '/transfer', payload)
      console.log(r.data)
      expect(r.status).toEqual(200);

      r = await clients[0].get(stack.ApiUrl + '/balance/payroll')
      expect(r.status).toEqual(200);
      expect(r.data.name).toEqual('payroll');
      expect(r.data.balance).toEqual(99);

      r = await clients[0].get(stack.ApiUrl + '/balance/savings')
      expect(r.status).toEqual(200);
      expect(r.data.name).toEqual('savings');
      expect(r.data.balance).toEqual(101);

    });

    it('transfers 1 dollar from payroll to savings 20 times concurrently', async () => { 
    
      let payload = {
        amount: 1,
        source_account_name: 'payroll',
        destination_account_name: 'opex',
        partner: 'test_user@test.com'
      }

      // Array(20).fill().map(async () => {
      //   let r = await clients[0].post(stack.ApiUrl + '/transfer', payload)
      //   expect(r.status).toEqual(200);
      // })

      let concurrency = 20
      let r = await Promise.all(Array(concurrency).fill().map(() => {
        return clients[0].post(stack.ApiUrl + '/transfer', payload)
      }))
      // console.log(r.data)
      // expect(r.status).toEqual(200);

      r = await clients[0].get(stack.ApiUrl + '/balance/payroll')
      expect(r.status).toEqual(200);
      expect(r.data.name).toEqual('payroll');
      expect(r.data.balance).toEqual(99-concurrency);

      r = await clients[0].get(stack.ApiUrl + '/balance/savings')
      expect(r.status).toEqual(200);
      expect(r.data.name).toEqual('opex');
      expect(r.data.balance).toEqual(101+concurrency);

    });

    
      
}); 
 