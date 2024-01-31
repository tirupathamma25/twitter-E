const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const geFollowingUsers = async (username) => {
  const getFollowingQuery = `
    SELECT following_user_id FROM follower 
    INNER JOIN user ON user.user_id = follower.follower_user_id
    WHERE user.username = '${username}';
    `;
  const followingPeople = await database.all(getFollowingQuery);
  const IdArray = followingPeople.map((eachUser) => eachUser.following_user_id);
  return IdArray;
};

const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "twitterToken", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  }
};

const tweetAcceccVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `
    SELECT * 
    FROM tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
    WHERE tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}';`;
  const tweet = await database.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

//API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO
        user (username,password,name,gender)
      VALUES
         ('${username}', '${hashedPassword}', '${name}','${gender}');`;

    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const dbResponse = await database.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await database.get(selectUserQuery);
  console.log(dbUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
        userId: dbUser.user_id,
      };
      const jwtToken = jwt.sign(payload, "twitterToken");
      console.log(jwtToken);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3

app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;

    const followingUserIds = await geFollowingUsers(username);
    const getUserQuery = `SELECT
     username,tweet, date_time AS dateTime
    FROM
      user INNER JOIN tweet ON
      user.user_id = tweet.user_id
     WHERE user.user_id IN (${followingUserIds}) 
     ORDER BY date_time  DESC
     LIMIT 4
      ;`;

    const userArray = await database.all(getUserQuery);

    response.send(userArray);
  }
);

//API 4

app.get("/user/following/", authenticationToken, async (request, response) => {
  let { userId } = request;
  console.log(userId);
  const getUserQuery = `
    SELECT
      user.name
    FROM
     follower INNER JOIN user 
     ON user.user_id = follower.following_user_id
     WHERE follower_user_id = '${userId}'
     ;`;
  const followingUserName = await database.all(getUserQuery);

  response.send(followingUserName);
});

//API 5
app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { userId } = request;
  const getUserQuery = `
    SELECT
     DISTINCT name
    FROM
     follower INNER JOIN user 
     ON user.user_id = follower.follower_user_id
    WHERE following_user_id = '${userId}'
    ;`;
  const followerName = await database.all(getUserQuery);

  response.send(followerName);
});

//API 6
app.get(
  "/tweets/:tweetId/",
  authenticationToken,
  tweetAcceccVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetQuery = `
    SELECT 
      tweet,
      (SELECT COUNT() FROM like WHERE tweet_id = '${tweetId}') AS likes,
      (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}') AS replies,
      date_time AS dateTime
    FROM 
   tweet 
   WHERE tweet.tweet_id = '${tweetId}'
   ;`;
    const tweetData = await database.get(getTweetQuery);
    response.send(tweetData);
  }
);

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  tweetAcceccVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `
   SELECT username FROM user INNER JOIN like ON user.user_id = like.user_id
    WHERE
      tweet_id = '${tweetId}';`;
    const likes = await database.all(getLikesQuery);
    const result = likes.map((eachUser) => eachUser.username);
    response.send({ likes: result });
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  tweetAcceccVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliesQuery = `
    SELECT
     name,reply 
    FROM
     user INNER JOIN reply ON user.user_id = reply.user_id
    WHERE
      tweet_id = ${tweetId};`;
    const replies = await database.all(getRepliesQuery);
    response.send({ replies: replies });
  }
);

//API 9

app.get("/user/tweets/", authenticationToken, async (request, response) => {
  let { userId } = request;
  const getTweetQuery = `
  SELECT
    tweet,
    COUNT(DISTINCT like_id) AS likes,
    COUNT(DISTINCT reply_id) AS replies,
    date_time AS dateTime
  FROM
      tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
      LEFT JOIN like
       ON tweet.tweet_id = like.tweet_id
    WHERE tweet.user_id = ${userId}
    GROUP BY tweet.tweet_id
       ;`;
  const tweets = await database.all(getTweetQuery);

  response.send(tweets);
});

//API 10

app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { tweet } = request.body;
  const postTweetQuery = `
  INSERT INTO
   tweet (tweet)
  VALUES
    ('${tweet}');`;
  const newTweet = await database.run(postTweetQuery);
  const tweetId = newTweet.lastID;

  response.send("Created a Tweet");
});

//API 11

app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    console.log(tweetId);
    const { userId } = request;
    console.log(userId);
    const getDeleteTweetQuery = `
     SELECT * 
     FROM tweet 
     WHERE
     
     user_id = '${userId}' AND tweet_id = '${tweetId}';`;

    const deletedTweet = await database.get(getDeleteTweetQuery);
    console.log(deletedTweet);
    if (deletedTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = '${tweetId}';`;
      await database.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
