var log = Script.require('https://hifi-content.s3.amazonaws.com/milad/ROLC/d/ROLC_High-Fidelity/02_Organize/O_Projects/Repos/hifi-content/developerTools/sharedLibraries/easyLog/easyLog.js')
var LocalEntity = Script.require('./entityMaker.js?' + Date.now());
var entityProps = Script.require('./defaultOverlayProps.js?' + Date.now());
var backgroundProps = Script.require('./defaultBackgroundProps.js?' + Date.now());
var textHelper = new (Script.require('./textHelper.js?' + Date.now()));
var request = Script.require('request').request;
var X = 0;
var Y = 1;
var Z = 2;

var _this;

function AvatarListManager(){
    _this = this;
    _this.avatars = {};
    _this.selectedAvatars = {};
    _this.redrawTimeout = null;
}


// Create the manager and hook up username signal
function create(){
    Users.usernameFromIDReply.connect(_this.handleUserName);

    return _this;
}


// Destory the manager and disconnect from username signal
function destroy(){
    Users.usernameFromIDReply.disconnect(_this.handleUserName);
    _this.reset();

    return _this;
}

// Add a user to the manager
function add(uuid, intersection){
    if (!_this.avatars[uuid]) {
        _this.avatars[uuid] = {
            avatarInfo: null,
            created: null,
            localEntityMain: new LocalEntity('local')
                .add(entityProps),
            // localEntityMainBackground: new LocalEntity('local')
            //     .add(backgroundProps),
            localEntitySub: new LocalEntity('local')
                .add(entityProps),
            // localEntitySublBackground: new LocalEntity('local')
                // .add(backgroundProps),
            intersection: intersection.intersection, 
            lastDistance: null,
            previousDistance: null,
            currentDistance: null,
            initialDistance: null,
            mainInitialDimensions: null,
            subInitialDimensions: null,
            previousName: null,
            localPositionOfIntersection: null,
            displayNameLength: 0,
            usernameLength: 0
        };
        _this.getInfo(uuid);
        _this.getUN(uuid);
    }
    var avatar = _this.avatars[uuid];
    var avatarInfo = avatar.avatarInfo;
    avatar.created = Date.now();
    avatar.intersection = intersection.intersection;
    avatar.localPositionOfIntersection = worldToLocal(avatar.intersection, avatarInfo.position, avatarInfo.orientation)
    _this.selectedAvatars[uuid] = true;
    _this.shouldShowOrCreate(uuid); 
    shouldToggleInterval();

    return _this;
}

function localToWorld(localOffset, framePosition, frameOrientation) {
    var worldOffset = Vec3.multiplyQbyV(frameOrientation, localOffset);
    return Vec3.sum(framePosition, worldOffset);
}

function worldToLocal(worldPosition, framePosition, frameOrientation, optionalInverseFrameOrientation) {
    var inverseFrameOrientation = optionalInverseFrameOrientation || Quat.inverse(frameOrientation);
    var worldOffset = Vec3.subtract(worldPosition, framePosition);
    return Vec3.multiplyQbyV(inverseFrameOrientation, worldOffset);
}

// Remove the avatar from the list
function remove(uuid){
    shouldDestoryOrHide(uuid);

    delete _this.selectedAvatars[uuid];
    shouldToggleInterval();
    
    return _this;
}


// Remove all the current overlays
function removeAllOverlays(){
    for (var uuid in _this.selectedAvatars) {
        _this.removeOverlay(uuid);
        delete _this.selectedAvatars[uuid];
    }

    return _this;
}

// Remove a single overlay
function removeOverlay(uuid, shouldDestory){
    var type = shouldDestory ? 'destroy' : 'hide';

    _this.avatars[uuid].localEntityMain[type]();
    // _this.avatars[uuid].localEntityMainBackground[type]();
    if (_this.avatars[uuid].localEntitySub) {
        _this.avatars[uuid].localEntitySub[type]();
    }

    return _this;
}


var Z_SIZE = 0.01;
// var SUB_OFFSET = -0.120;
var SUB_OFFSET = -0.0101;
var MAIN_SCALER = 0.75;
var SUB_SCALER = 0.55;
var LINE_HEIGHT_SCALER = 0.99;
var DISTANCE_SCALER = 0.35;
function calculateInitialProperties(uuid, type) {
    var avatar = _this.avatars[uuid];
    var avatarInfo = avatar.avatarInfo;

    var localEntity;
    var adjustedScaler = null;
    var textProps = null;
    var target = null;
    var distance = null;
    var dimensions = null;
    var lineHeight = null;
    var scaledDimensions = null;
    var localPosition = null;
    var initialDimensions = null;

    if (type === "main") {
        localEntity = avatar.localEntityMain;
        initialDimensions = avatar.mainInitialDimensions;
    } else {
        localEntity = avatar.localEntitySub;
        initialDimensions = avatar.subInitialDimensions;
    }

    textProps = localEntity.get(['text', 'lineHeight']);
    textHelper
        .setText(textProps.text)
        .setLineHeight(textProps.lineHeight);
    
    target = avatarInfo.position;    
    distance = _this.getDistance(avatar, target);
    adjustedScaler = distance * DISTANCE_SCALER;
    dimensions = [textHelper.getTotalTextLength(), textProps.lineHeight, Z_SIZE];
    scaledDimensions = Vec3.multiply(
        Vec3.multiply(dimensions, adjustedScaler), 
        type === "main" ? MAIN_SCALER : SUB_SCALER
    );
    lineHeight = scaledDimensions.y * LINE_HEIGHT_SCALER;

    // if (type === "main") {
    //     log("!!!!!!!! lineHeight", lineHeight)
    //     log("!!!!!!!! scaledDimensions", scaledDimensions.y)
    
    // }
    
    if (type === "sub") {
        var localEntityMainY = avatar.localEntityMain.get('dimensions', true).y
        var localEntityMainPosition = avatar.localEntityMain.get('position', true)
        var halfLocalEntityMainY = localEntityMainY / 2;
        var halfScaledD = scaledDimensions.y / 2;
        var totalHalfs = halfLocalEntityMainY + halfScaledD;
        // log("localEntityMainY", localEntityMainY);
        // log("localEntityMainPosition", localEntityMainPosition.y);
        // log("scaledDimensions.y", scaledDimensions.y);
        
        // var differenceY = localEntityMainY - scaledDimensions.y
        localPosition =
            // [0, -lineHeight + SUB_OFFSET, 0];
            [0, (-totalHalfs), 0]
            // [0, (-localEntityMainY + differenceY) + (SUB_OFFSET * adjustedScaler), 0]
            // [0, lineHeight * adjustedScaler * SUB_SCALER * SUB_OFFSET, 0];
    }

    return {
        distance: distance,
        scaledDimensions: scaledDimensions,
        lineHeight: lineHeight,
        localPosition: localPosition
    };
}


function handleSelect(uuid, intersection) {
    if (uuid in _this.selectedAvatars) {
        _this.remove(uuid);
    } else {
        _this.add(uuid, intersection);
    }    
}


// Handler for the username call
function handleUserName(uuid, username){
    // log("in handle user name");
    if (username) {
        var avatar = _this.avatars[uuid];
        var avatarInfo = avatar.avatarInfo;
        avatarInfo.username = username;
        avatar.usernameLength = username.length;
        _this.makeSubName(uuid, CREATE);
        _this.getInfoAboutUser(uuid);
    }
}


function handleUUIDChanged(){

}


// var FRIEND_TEXT = [255, 255, 255];
var FRIEND_TEXT = [100, 255, 50];
function handleFriend(uuid, username) {
    // log("handle friend");
    var avatar = _this.avatars[uuid];
    var avatarInfo = avatar.avatarInfo;
    avatarInfo.username = username;
    avatar.usernameLength = username.length;

    var localEntityMain = avatar.localEntityMain;
    var localEntitySub = avatar.localEntitySub;
    
    localEntityMain
        .edit("textColor", FRIEND_TEXT);

    if (localEntitySub.id){         
        localEntitySub
            .edit("textColor", FRIEND_TEXT);
            // .edit("backgroundColor", FRIEND_TEXT);
    } else {
        _this.makeSubName(uuid, CREATE);
                 
        // localEntitySub
            // .edit("backgroundColor", FRIEND_TEXT);

    }
}


// Handle redrawing if needed
function reDraw(uuid, type){
    var avatar = _this.avatars[uuid];
    var localEntity;
    // var localEntityMainBackground;
    var initialDimensions = null;
    var initialDistance = null;
    var currentDistance = null;
    var newDimensions = null;
    var lineHeight = null;
    var adjustedScaler = null;
    var localPosition = null;

    initialDistance = avatar.initialDistance;
    currentDistance = avatar.currentDistance;
    
    if (type === "main") {
        localEntity = avatar.localEntityMain;
        initialDimensions = avatar.mainInitialDimensions;
    } else {
        localEntity = avatar.localEntitySub;
        initialDimensions = avatar.subInitialDimensions;
    }

    newDimensions = [
        (initialDimensions[X] / initialDistance) * currentDistance,
        (initialDimensions[Y] / initialDistance) * currentDistance,
        (initialDimensions[Z] / initialDistance) * currentDistance
    ];

    lineHeight = newDimensions[Y] * LINE_HEIGHT_SCALER;

    adjustedScaler = currentDistance * DISTANCE_SCALER;
    localEntity
        .add("lineHeight", lineHeight)
        .add("dimensions", newDimensions);
    // var subScaledX = avatar.subInitialScaledDimensions.x
    // var mainEntityX = avatar.mainInitialDimensions.x
    
    // if (mainEntityX <= subScaledX) {
    //     log("2 @@@ username is bigger")
    //     var currentMainDimensions = avatar.localEntityMain.get('dimensions', true);
    //     var initialMainDimensions = avatar.mainInitialDimensions;
    //     newDimensions = [
    //         (initialMainDimensions[X] / initialDistance) * currentDistance,
    //         (initialMainDimensions[Y] / initialDistance) * currentDistance,
    //         (initialMainDimensions[Z] / initialDistance) * currentDistance
    //     ];
        // var newMainLineHeight = currentMainDimensions.y * LINE_HEIGHT_SCALER;
        // var newMainDimensions = [newDimensions[X], currentMainDimensions.y, currentMainDimensions.z];
    //     log("currentMainDimensions", currentMainDimensions)
    //     log("newMainDimensions", newMainDimensions)
    //     log("newDimensions", newDimensions)
    //     avatar.localEntityMain
    //         .add('lineHeight', newMainDimensions.y)
    //         .add('dimensions', newMainDimensions)
    //         .sync();
    // }
    
    if (type === "sub") {
        var localEntityMainY = avatar.localEntityMain.get('dimensions', true).y;
        var subInitialLocalPosition = avatar.subInitialLocalPosition[Y];
        // var currentSubDimensions = avatar.localEntitySub.get('dimensions', true);
        // var currentMainDimensions = avatar.localEntityMain.get('dimensions', true);
        // log("subInitialLocalPosition", subInitialLocalPosition)
        var newLocalPosition = subInitialLocalPosition / initialDistance * currentDistance;
        // var localEntityMainY = currentMainDimensions.y
        // var differenceY = localEntityMainY - avatar.mainInitialDimensions.y
        // log("localEnityMainY", localEntityMainY) 
        // log("newLocalPosition", newLocalPosition) 
        localPosition =
            [0, newLocalPosition, 0];

        // localPosition =
        //     [0, (-localEntityMainY + differenceY) + (SUB_OFFSET * adjustedScaler), 0]

        // localPosition =
        //     [0, (-localEntityMainY - differenceY) + (SUB_OFFSET * adjustedScaler), 0]

        localEntity
            .add("localPosition", localPosition);
    }

    localEntity
        .sync();

}


function maybeDelete(uuid){
    // log("in maybe delete");
    var avatar = _this.avatars[uuid];
    var createdTime = avatar.created;
    var currentTime = Date.now();
    var timeSinceCreated = currentTime - createdTime;
    log('avatar name', avatar.displayName);
    log('timeSinceCreated', timeSinceCreated);    
    if (timeSinceCreated > DELETE_TIMEOUT_MS) {
        return true;
    } else {
        return false;
    }
}


// makes sure clear interval exists before changing.
function maybeClearInterval(){
    if (_this.redrawTimeout) {
        Script.clearInterval(_this.redrawTimeout);
        _this.redrawTimeout = null;
    }
}


// function updateName(uuid, name){
//     var avatar = _this.avatars[uuid];
//     var avatarInfo = avatar.avatarInfo;
//     var localEntityMain = avatar.localEntityMain;
//     // var localEntityMainBackground = avatar.localEntityMainBackground;
//     var calculatedProps = null;
//     var distance = null;
//     var scaledDimensions = null;
//     var lineHeight = null;

//     localEntityMain.add("text", avatarInfo.displayName);
//     calculatedProps = _this.calculateInitialProperties(uuid, "main");
//     lineHeight = calculatedProps.lineHeight;
//     scaledDimensions = calculatedProps.scaledDimensions;
//     distance = calculatedProps.distance;
//     avatar.initialDistance = distance;
//     avatar.mainInitialDimensions = scaledDimensions;
//     avatar.previousName = avatarInfo.displayName;

//     localEntityMain
//         .add("lineHeight", lineHeight)
//         .add("dimensions", scaledDimensions)
//         .sync();
//     // localEntityMainBackground
//     //     .add("lineHeight", lineHeight)
//     //     .add("dimensions", scaledDimensions)
//     //     .sync();
// }
function updateName(uuid, name){
    var avatar = _this.avatars[uuid];
    var avatarInfo = avatar.avatarInfo;
    avatar.localEntityMain;
    avatar.localEntitySub;
    avatar.localEntityMain.destroy();
    avatar.localEntitySub.destroy();

    avatar.localEntityMain = new LocalEntity('local').add(entityProps);
    avatar.localEntitySub = new LocalEntity('local').add(entityProps);
    var localOffset = avatar.localPositionOfIntersection;
    avatar.intersection = localToWorld(localOffset, avatarInfo.position, avatarInfo.orientation)
    _this.makeMainName(uuid, CREATE);
    _this.makeSubName(uuid, CREATE);
}

var MAX_DISTANCE_METERS = 0.1;
var DELETE_TIMEOUT_MS = 120000;
function maybeRedraw(uuid){
    _this.getInfo(uuid);
    var avatar = _this.avatars[uuid];
    var avatarInfo = avatar.avatarInfo;
    
    if (_this.maybeDelete(uuid)) {
        _this.remove(uuid);

        return;
    }

    _this.getDistance(avatar);
    var distanceDelta = Math.abs(avatar.currentDistance - avatar.previousDistance);

    if (distanceDelta < MAX_DISTANCE_METERS){
        return;
    }

    avatarInfo.displayName = avatarInfo.displayName === "" ? "anonymous" : avatarInfo.displayName;
    if (avatar.previousName !== avatarInfo.displayName) {
        log("previous name different");
        updateName(uuid, avatarInfo.displayName);
    } else {
        _this.reDraw(uuid, "main");
    }
    
    if (avatarInfo.username) {
        _this.reDraw(uuid, "sub");
    }
}


function maybeRemove(uuid) {
    if (uuid in _this.avatars) {
        _this.remove(uuid);
    }
}

function checkAllSelectedForRedraw(){
    for (var avatar in _this.selectedAvatars) {
        maybeRedraw(avatar);
    }
}


var REDRAW_TIMEOUT = 150;
function makeMainName(uuid, shouldCreate){
    var avatar = _this.avatars[uuid];
    var avatarInfo = avatar.avatarInfo;
    var localEntityMain = avatar.localEntityMain;
    var calculatedProps = null;
    var position = null;
    var distance = null;
    var scaledDimensions = null;
    var lineHeight = null;

    // Get the intersection position for use later in redraw
    position = avatar.intersection;
    avatarInfo.displayName = avatarInfo.displayName === "" ? "anonymous" : avatarInfo.displayName;
    // # TODO REMOVE DISPLAY NAME USAGE IF NOT WORKING
    avatar.displayNameLength = avatarInfo.displayName.length;
    if (shouldCreate){
        // log("creating", avatarInfo.displayName);
        localEntityMain.add("text", avatarInfo.displayName);

        calculatedProps = _this.calculateInitialProperties(uuid, "main");
        // log("calculated props", calculatedProps)
        distance = calculatedProps.distance;
        scaledDimensions = calculatedProps.scaledDimensions;
        lineHeight = calculatedProps.lineHeight;

        avatar.initialDistance = distance;
        avatar.mainInitialDimensions = scaledDimensions;
        avatar.previousName = avatarInfo.displayName;
        
        localEntityMain
            .add("lineHeight", lineHeight)
            .add("dimensions", scaledDimensions)
            .add("position", position)
            .add("parentID", uuid)
            .create(true);
    } else {
        localEntityMain.edit("position", position);
        _this.getInfo(uuid);
        _this.getDistance(avatar);
        _this.reDraw(uuid, "main");
        Script.setTimeout(function(){
            localEntityMain.show();
        }, REDRAW_TIMEOUT);
    }
}


// Make the smaller username when it is available
var SUB_BACKGROUND = "#1A1A1A";
var SUB_TEXTCOLOR = "#868481";
var SUB_PADDING = 1.0;
var DEFAULT_LEFT_SUB_MARGIN = 0.03;
function makeSubName(uuid, shouldCreate){
    var avatar = _this.avatars[uuid];
    var avatarInfo = avatar.avatarInfo;      
    var localEntityMain = avatar.localEntityMain;
    var localEntitySub = avatar.localEntitySub;
    var calculatedProps = null;
    var distance = null;
    var scaledDimensions = null;
    var lineHeight = null;
    var localPosition = null;


    if (shouldCreate) {
        localEntitySub.add("text", avatarInfo.username);

        calculatedProps = _this.calculateInitialProperties(uuid, "sub");
        lineHeight = calculatedProps.lineHeight;
        scaledDimensions = calculatedProps.scaledDimensions;
        // log("avatar.displayNameLength", avatar.displayNameLength)
        // log("avatar.usernameLength", avatar.usernameLength)
        avatar.subInitialScaledDimensions = scaledDimensions;

        var subScaledX = scaledDimensions.x
        var mainEntityX = localEntityMain.get('dimensions', true).x
        if (mainEntityX >= subScaledX) {
            // log("@@@ display name is bigger");            
            var localEntityMainX = localEntityMain.get('dimensions', true).x;
            var adjustedScale = [localEntityMainX, scaledDimensions.y, scaledDimensions.z];
        } else {
            // log("@@@ username is bigger")
            var adjustedScale = scaledDimensions;
            var currentMainDimensions = localEntityMain.get('dimensions', true);
            var currentLineHeight = localEntityMain.get('lineHeight', true);
            var newMainDimensions = [adjustedScale.x, currentMainDimensions.y, currentMainDimensions.z]
            localEntityMain
                .add('dimensions', newMainDimensions)
                .sync()
            avatar.mainInitialDimensions = newMainDimensions;
        }
        // if (avatar.displayNameLength >= avatar.usernameLength) {
        //     log("@@@ display name is bigger");            
        //     var localEntityX = localEntityMain.get('dimensions', true).x;
        //     var adjustedScale = [localEntityX, scaledDimensions.y, scaledDimensions.z];
        // } else {
        //     log("@@@ username is bigger")
        //     var adjustedScale = scaledDimensions;
        //     var currentMainDimensions = localEntityMain.get('dimensions', true);
        //     var currentLineHeight = localEntityMain.get('lineHeight', true);
        //     localEntityMain
        //         .add('dimensions', [adjustedScale.x, currentMainDimensions.y, currentMainDimensions.z])
        //         .sync()
        // }

        distance = calculatedProps.distance;
        localPosition = calculatedProps.localPosition;
    
        avatar.subInitialDimensions = adjustedScale;
        avatar.subInitialLocalPosition = localPosition;
        localEntitySub
            .add("lineHeight", lineHeight)
            .add("localPosition", localPosition)
            // .add("backgroundAlpha", 0.0)
            .add("backgroundColor", SUB_BACKGROUND)
            .add("textColor", SUB_TEXTCOLOR)
            .add("parentID", localEntityMain.id)
            .add("dimensions", adjustedScale)
            .create(true);
    } else {
        _this.reDraw(uuid, "sub");
        Script.setTimeout(function(){
            localEntitySub.show();
        }, REDRAW_TIMEOUT);
    }
   
}


// Request the username
function getUN(uuid){
    if (_this.avatars[uuid].avatarInfo.username) {
        return;
    } else if (Users.canKick) {
        Users.requestUsernameFromID(uuid);
    } else {
        _this.getInfoAboutUser(uuid);
    }
}


// Get the current data for an avatar
function getInfo(uuid){
    var avatar = _this.avatars[uuid];
    var avatarInfo = avatar.avatarInfo;
    var newAvatarInfo = AvatarManager.getAvatar(uuid);
    var combinedAvatarInfo = Object.assign({}, newAvatarInfo, {username: avatarInfo === null ? null : avatarInfo.username });
    _this.avatars[uuid] = Object.assign({}, avatar, {avatarInfo: combinedAvatarInfo});

    return _this;
}


function getDistance(avatar) {
    var eye = Camera.position;
    var target = avatar.avatarInfo.position;

    avatar.previousDistance = avatar.currentDistance;
    avatar.currentDistance = Vec3.distance(target, eye);

    return avatar.currentDistance;
}


function requestJSON(url, callback) {
    request({
        uri: url
    }, function (error, response) {
        if (error || (response.status !== 'success')) {
            print("Error: unable to get request", error || response.status);
            return;
        }
        callback(response.data);
    });
}


var METAVERSE_BASE = Account.metaverseServerURL;
var REG_EX_FOR_ID_FORMATTING = /[\{\}]/g;
function getInfoAboutUser(uuid) {
    // log("running get info about users");
    var url = METAVERSE_BASE + '/api/v1/users?filter=connections&status=online';
    requestJSON(url, function (connectionsData) {
        var users = connectionsData.users;
        for (var i = 0; i < users.length; i++) {
            var user = users[i];
            if (user.location && user.location.node_id === uuid.replace(REG_EX_FOR_ID_FORMATTING, "")) { 
                _this.handleFriend(uuid, user.username);
                break;
            }
        }
    });
}



// Reset the avatar list
function reset(){
    _this.removeAllOverlays();
    _this.avatars = {};
    shouldToggleInterval();

    return _this;
}


var CREATE = true;
var SHOW = false;
function shouldShowOrCreate(uuid){
    var avatar = _this.avatars[uuid];
    var avatarInfo = avatar.avatarInfo;

    // log("should show or create")
    var localEntityMainID = avatar.localEntityMain.id;
    var localEntitySubID = avatar.localEntitySub.id;
    // log("localEntityMainID", localEntityMainID);
    if (localEntityMainID) {
        // log("should show");
        _this.makeMainName(uuid, SHOW);
    } else {
        // log("should create");
        _this.makeMainName(uuid, CREATE);
    }

    if (localEntityMainID && localEntitySubID) {
        _this.makeSubName(uuid, SHOW);
    } else if (localEntityMainID && avatarInfo.username) {
        _this.makeSubName(uuid, CREATE);
    }
}


var DESTROY = true;
var HIDE = false;
function shouldDestoryOrHide(uuid){
    var avatar = _this.avatars[uuid];
    if (avatar) {
        _this.removeOverlay(uuid, HIDE);
    } else {
        _this.removeOverlay(uuid, DESTROY);
    }
}


function shouldToggleInterval(){
    var currentNumberOfAvatarsSelected = Object.keys(_this.selectedAvatars).length;

    if (currentNumberOfAvatarsSelected === 0 && _this.redrawTimeout) {
        toggleInterval();
        return;
    }

    if (currentNumberOfAvatarsSelected > 0 && !_this.redrawTimeout) {
        toggleInterval();
        return; 
    }
}


// Turn off and on the redraw check
var INTERVAL_CHECK_MS = 100;
function toggleInterval(){
    if (_this.redrawTimeout){
        maybeClearInterval();
    } else {
        _this.redrawTimeout = 
            Script.setInterval(_this.checkAllSelectedForRedraw, INTERVAL_CHECK_MS);
    }
}


AvatarListManager.prototype = {
    create: create,
    destroy: destroy,
    add: add, // uuid, intersection
    remove: remove, // uuid
    removeAllOverlays: removeAllOverlays,
    removeOverlay: removeOverlay, // uuid
    calculateInitialProperties: calculateInitialProperties,
    handleSelect: handleSelect, // uuid, intersection
    handleUserName: handleUserName, // uuid, username
    handleUUIDChanged: handleUUIDChanged, // ## todo
    handleFriend: handleFriend, // uuid
    reDraw: reDraw, // uuid, type
    maybeDelete: maybeDelete,
    maybeClearInterval: maybeClearInterval, // ## todo
    maybeRedraw: maybeRedraw, // uuid
    maybeRemove: maybeRemove, // uuid
    checkAllSelectedForRedraw: checkAllSelectedForRedraw,
    makeMainName: makeMainName, // uuid
    makeSubName: makeSubName, // uuid
    getUN: getUN, // uuid
    getInfo: getInfo, // uuid
    getDistance: getDistance,
    getInfoAboutUser: getInfoAboutUser, // uuid
    reset: reset,
    shouldShowOrCreate: shouldShowOrCreate
};


function rotateBillboard(position, frustrumPos){
    var avatarUp = Quat.getUp(MyAvatar.orientation);
    
    // var newRotation = Quat.lookAt(frustrumPos, position, avatarUp);
    var newRotation = Quat.conjugate(Quat.lookAt(frustrumPos, position, avatarUp));
    return newRotation;
}

module.exports = AvatarListManager;


/*

var DEFAULT_LEFT_MARGIN = 0.070;

Billboard

input
1. position
2. rotation
3. billboardMode
4. frustrumPos


avatarUp - GetUp on avatar orientation

cross of position - frustrum, avatarUp

glm conjugate = to quat = look at frustrumpos, position, avatarup

*/

// var box = Entities.addEntity({type: "Box", position: MyAvatar.position})

// Script.clearInterval(clearTimer);
// var handler = function(){
//     var position = Entities.getEntityProperties(box, 'position');
//     var rotation = rotateBillboard(position, Camera.frustum.position);
//     Entities.editEntity(box, {rotation: rotation});
// };
// var clearTimer = Script.setInterval(handler, 10);
