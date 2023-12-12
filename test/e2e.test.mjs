import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation"; // ES Modules import
import { AdminCreateUserCommand, AdminDeleteUserCommand,  AdminSetUserPasswordCommand,  CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import axios from "axios";

import { matchers } from 'jest-json-schema';
expect.extend(matchers);

const cloudformation = new CloudFormationClient({
  region: process.env.AWS_REGION || "us-east-2",
});
const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || "us-east-2",
});

let stack;

const USERS = [{
  username: 'test-user@test.com',
  password: '12345678',
}, {
  username: 'test-user2@test.com',
  password: '434234234',
}]
/*
  1. get stack outputs with cloudformation
  2. setup user accounts for the test
*/
beforeAll(async () => {
  console.log('1 - beforeAll')
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
        UserAttributes: [
          {
            Name: 'email',
            Value: user.username
          },
          {
            Name: 'email_verified',
            Value: 'true'
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



});





afterAll(() => {
  // delete users with cognito
  let delete_test_users = ['test-user@test.com', 'test-user2@test.com'].map(async (username) => {
    await cognito.send(new AdminDeleteUserCommand({
      UserPoolId: stack.UserPool,
      Username: username
    }))
  })

  Promise.all(delete_test_users)
});


describe('registered user', () => { 
  let token
  it('gets a jwt token from cognito', async () => { 

      let r = await axios.post('https://cognito-idp.us-east-2.amazonaws.com/', {
        "AuthFlow": "USER_PASSWORD_AUTH",
        "ClientId": "5lui55u51lglkg53n82ehlsv2u",
        "AuthParameters": {
          "USERNAME": USERS[0].username,
          "PASSWORD": USERS[0].password
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

    });

    it('fails to call endpoint without token', async () => { 
      try{
        let r = await axios.get(stack.ApiUrl + '/', {
          headers: {
          }
        })
      }catch(e){
        expect(e.response.status).toEqual(401);
      }
    });

    it('able to call endpoint with token', async () => { 
      let r = await axios.get(stack.ApiUrl + '/', {
        headers: {
          'Authorization': token
        }
      })
      expect(r.status).toEqual(200);
      console.log(r.data)
    });


      
}); 
 