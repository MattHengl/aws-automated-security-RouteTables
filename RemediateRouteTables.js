/*!
     * Copyright 2017-2017 Mutual of Enumclaw. All Rights Reserved.
     * License: Public
*/ 

//Mutual of Enumclaw 
//
//Matthew Hengl and Jocelyn Borovich - 2019 :) :)
//
//Main file that controls remediation and notifications of all EC2 Route Tables events. 
//Remediates actions when possible or necessary based on launch type and tagging. Then, notifies the user/security. 

//Make sure to that the master.invalid call does NOT have a ! infront of it
//Make sure to delete or comment out the change in the process.env.environtment

// import { EC2 } from 'aws-sdk';
// const ec2 = new EC2();
// import { Master, path } from 'aws-automated-master-class';
// const master = new Master();
const AWS = require('aws-sdk');
AWS.config.update({region: process.env.region});
const ec2 = new AWS.EC2;
const epsagon = require('epsagon');
const Master = require("aws-automated-master-class/MasterClass").handler;
let path = require("aws-automated-master-class/MasterClass").path;
let master = new Master();

let callRemediate = remediate;
let callHandler = handleEvent;

async function handleEvent(event){

  let resourceName = 'routeTableId';
  console.log(JSON.stringify(event));
  path.p = 'Path: \nEntered handleEvent';


  event = master.devTest(event);
  //Checks if there is an error in the log
  if (master.errorInLog(event)) {
    console.log(path.p);
    return; 
  }

  //Checks if the log came from this function, quits the program if it does.
  if (master.selfInvoked(event)) {
    console.log(path.p);
    return;
  }

  console.log(`Event action is ${event.detail.eventName}------------------------`);

  if(event.detail.eventName == 'CreateRouteTable'){
    resourceName = 'vpcId';
  }else if(event.detail.eventName == 'DisassociateRouteTable'){
    resourceName = 'associationId';
  }
  //if(master.checkKeyUser(event, resourceName)){
    //change this for when you're not testing in snd.
    if(master.invalid(event)){
      try{
        await master.notifyUser(event, await callRemediate(event), 'Route Table');
      }
      catch(e){
        console.log(e);
        path.p += '\nERROR';
        console.log(path.p);
        // delete path.p;
        return e;
      }
    }
  //}
  console.log(path.p);
  // delete path.p;
};

async function remediate(event){

  path.p += '\nEntered the remediation function';

  const erp = event.detail.requestParameters;
  const ere = event.detail.responseElements;

  let params = { RouteTableId: erp.routeTableId };
  let results = master.getResults(event, {ResourceName: erp.routeTableId});

  try{
    switch(results.Action){
      //done!
      case 'CreateRoute': //DeleteRoute
        path.p += '\nCreateRoute';
        if(erp.destinationCidrBlock){params.DestinationCidrBlock = erp.destinationCidrBlock;}
        if(erp.destinationIpv6CidrBlock){params.DestinationIpv6CidrBlock = erp.destinationIpv6CidrBlock;}
        await overrideFunction('deleteRoute', params);
        results.Response = 'DeleteRoute';
      break;
      //done
      case 'CreateRouteTable'://DeleteRouteTable
        path.p += '\nCreateRouteTable';
        params.RouteTableId = ere.routeTable.routeTableId;
        await overrideFunction('deleteRouteTable', params);
        results.ResourceName = params.RouteTableId;
        results.Response = 'DeleteRouteTable';
      break;
      //cant perform right now
      case 'ReplaceRoute':
        path.p += '\nReplaceRoute';
        await overrideFunction('replaceRoute', paramsBuilder(erp));
        results.Response = 'ReplaceRoute';
      break;
      //done!
      case 'ReplaceRouteTableAssociation'://DisassociateRouteTable
        path.p += '\nReplaceRouteTableAssociation';
        params = {AssociationId: ere.newAssociationId};
        await overrideFunction('disassociateRouteTable', params);
        results.AssociationId = params.AssociationId;
        results.Response = 'DisassociateRouteTable';
      break;
      //done!
      case 'DeleteRouteTable'://Notify
        path.p += '\nDeleteRouteTable';
        results.Response = 'Remediation could not be performed';
      break;
      //done!
      case 'DeleteRoute'://Notify
        path.p += '\nDeleteRoute'; 
        results.Response = 'Remediation could not be performed';
      break;
      //done!
      case 'AssociateRouteTable'://DisassociateRouteTable
        path.p += '\nAssociateRouteTable';
        params = {AssociationId: ere.associationId};
        await overrideFunction('disassociateRouteTable', params);
        results.Response = 'DisassociateRouteTable';
      break;
      //done!
      case 'DisassociateRouteTable'://Notify
        path.p += 'DisassociateRouteTable';
        results.Response = 'Remediation could not be performed';
      break;
    }
  }catch(e){
    console.log(e);
    path.p += '\nERROR';
    return e;
  }
  results.Reason = 'Improper Launch';
  if(results.Response == 'Remediation could not be performed'){
    delete results.Reason;
  }
  path.p += '\nRemediation was finished, notifying user now';
  console.log(results);
  return results;
};

function paramsBuilder(event) {
  console.log(event);
  let params = {RouteTableId: event.routeTableId};
  if(event.DestinationCidrBlock){params.DestinationCidrBlock = event.DestinationCidrBlock;}
  if(event.DestinationIpv6CidrBlock){params.DestinationIpv6CidrBlock = event.DestinationIpv6CidrBlock;}
  if(event.egressOnlyInternetGatewayId){params.EgressOnlyInternetGatewayId = event.egressOnlyInternetGatewayId;}
  if(event.gatewayId){params.GatewayId = event.gatewayId;}
  if(event.instanceId){params.InstanceId = event.instanceId;}
  if(event.localGatewayId){params.LocalGatewayId = event.localGatewayId;}
  if(event.natGatewayId){params.NatGatewayId = event.natGatewayId;}
  if(event.networkInterfaceId){params.NetworkInterfaceId = event.networkInterfaceId;}
  if(event.transitGatewayId){params.TransitGatewayId = event.transitGatewayId;}
  if(event.vpcPeeringConnectionId){params.VpcPeeringConnectionId = event.vpcPeeringConnectionId;}
  return params;
};

async function overrideFunction(apiFunction, params){
  if(process.env.run == 'false'){
    await setEc2Function(apiFunction, (params) => {
      console.log(`Overriding ${apiFunction}`);
      return {promise: () => {}};
    });
  }
  await ec2[apiFunction](params).promise();
};

exports.handler = handleEvent;
exports.remediate = remediate;

exports.setEC2Function = (value, funct) => {
  ec2[value] = funct;
};
exports.setRemediate = (funct) => {
  callRemediate = funct;
};
exports.setHandler = (funct) => {
  callHandler = funct;
};