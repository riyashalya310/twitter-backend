const express = require("express");
const app = express();
app.use(express.json());
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, (request, response) => {
      console.log(`console is running`);
    });
  } catch (e) {
    console.log(`error->${e.message}`);
  }
};

initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const auth = request.headers["authorization"];
  if (auth !== undefined) {
    jwtToken = auth.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const ifUserExists = `SELECT * FROM user WHERE username='${username}'`;
  const user = await db.get(ifUserExists);
  if (user !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const encryptedPassword = await bcrypt.hash(password, 10);
      const insertUser = `
      INSERT INTO user(name,username,password,gender)
      VALUES (
          '${name}',
          '${username}',
          '${encryptedPassword}',
          '${gender}'
      )
      `;
      await db.run(insertUser);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const ifUserExists = `SELECT * FROM user WHERE username='${username}'`;
  const user = await db.get(ifUserExists);
  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (isPasswordMatch) {
      const payload = {
        username,
      };
      const jwtToken = jwt.sign(payload, "MY_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username='${username}'`;
  const responseUser = await db.get(getUserId);
  const userId = responseUser.user_id;
  const query = `
  SELECT user.username,tweet.tweet,tweet.date_time AS dateTime FROM follower 
  INNER JOIN tweet ON tweet.user_id=follower.following_user_id
  INNER JOIN user ON tweet.user_id=user.user_id
  WHERE follower.follower_user_id='${userId}'
  ORDER BY tweet.date_time DESC
  LIMIT 4`;
  const responseArr = await db.all(query);
  response.send(
    responseArr.map((item) => ({
      username: item.username,
      tweet: item.tweet,
      dateTime: item.dateTime,
    }))
  );
});

app.get("/user/following", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username='${username}'`;
  const responseUser = await db.get(getUserId);
  const userId = responseUser.user_id;
  const query = `
  SELECT user.name FROM user
  INNER JOIN follower
  ON user.user_id=follower.following_user_id
  WHERE follower.follower_user_id='${userId}'`;
  const responseArr = await db.all(query);
  response.send(
    responseArr.map((item) => ({
      name: item.name,
    }))
  );
});

app.get("/user/followers", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username='${username}'`;
  const responseUser = await db.get(getUserId);
  const userId = responseUser.user_id;
  const query = `
  SELECT user.name FROM user
  INNER JOIN follower
  ON user.user_id=follower.following_user_id
  WHERE follower.follower_user_id='${userId}'`;
  const responseArr = await db.all(query);
  response.send(
    responseArr.map((item) => ({
      name: item.name,
    }))
  );
});

app.get("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const getUserId = `SELECT user_id FROM user WHERE username='${username}'`;
  const responseUser = await db.get(getUserId);
  const userId = responseUser.user_id;
  const ifValidQuery = `
  SELECT follower.following_user_id 
  FROM follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id
  WHERE follower.follower_user_id='${userId}' and tweet.tweet_id='${tweetId}'`;
  const validUsers = await db.all(ifValidQuery);
  if (validUsers !== undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const query = `
  SELECT 
  tweet.tweet,likes AS SUM(like.like_id),replies AS SUM(reply.reply_id),tweet.date_time
  FROM follower 
  INNER JOIN tweet ON follower.following_user_id=tweet.user_id
  INNER JOIN reply ON follower.following_user_id=reply.user_id
  INNER JOIN like ON follower.following_user_id=like.user_id
  WHERE follower.follower_user_id='${userId}' and tweet.tweet_id='${tweetId}'`;
    const responseArr = await db.get(query);
    response.send({
      tweet: responseArr.tweet,
      likes: responseArr.likes,
      replies: responseArr.replies,
      dateTime: responseArr.date_time,
    });
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserId = `SELECT user_id FROM user WHERE username='${username}'`;
    const responseUser = await db.get(getUserId);
    const userId = responseUser.user_id;
    const ifValidQuery = `
  SELECT follower.following_user_id 
  FROM follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id
  WHERE follower.follower_user_id='${userId}' and tweet.tweet_id='${tweetId}'`;
    const validUsers = await db.all(ifValidQuery);
    if (validUsers !== undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const query = `
  SELECT 
  user.username
  FROM user 
  INNER JOIN tweet ON follower.following_user_id=tweet.user_id
  INNER JOIN like ON follower.following_user_id=like.user_id
  WHERE follower.follower_user_id='${userId}' and tweet.tweet_id='${tweetId}'`;
      const responseArr = await db.get(query);
      response.send({
        tweet: responseArr.tweet,
        likes: responseArr.likes,
        replies: responseArr.replies,
        dateTime: responseArr.date_time,
      });
    }
  }
);

app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserId = `SELECT user_id FROM user WHERE username='${username}'`;
    const responseUser = await db.get(getUserId);
    const userId = responseUser.user_id;
    const ifValidQuery = `
  SELECT follower.following_user_id 
  FROM follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id
  WHERE follower.follower_user_id='${userId}' and tweet.tweet_id='${tweetId}'`;
    const validUsers = await db.all(ifValidQuery);
    if (validUsers !== undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const query = `
  SELECT 
  user.name,reply.reply
  FROM user 
  INNER JOIN tweet ON follower.following_user_id=tweet.user_id
  INNER JOIN follower ON follower.following_user_id=like.user.user_id
  WHERE follower.follower_user_id='${userId}' and tweet.tweet_id='${tweetId}'`;
      const responseArr = await db.all(query);
      response.send({
        replies: responseArr.map((reply) => ({
          name: reply.name,
          reply: reply.reply,
        })),
      });
    }
  }
);

app.get("/user/tweets", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username='${username}'`;
  const responseUser = await db.get(getUserId);
  const userId = responseUser.user_id;
  const query = `
  SELECT tweet.tweet,likes AS SUM(like.like_id),
  replies AS SUM(reply_id),tweet.date_time 
  FROM tweet 
  INNER JOIN like
  ON tweet.user_id=like.user_id
  INNER JOIN reply 
  ON tweet.user_id = reply.user_id
  WHERE tweet.user_id='${userId}'`;
  const responseArr = await db.all(query);
  response.send(
    responseArr.map((item) => ({
      tweet: item.tweet,
      likes: item.likes,
      replies: item.replies,
      dateTime: item.date_time,
    }))
  );
});

app.post("/user/tweets", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username='${username}'`;
  const responseUser = await db.get(getUserId);
  const userId = responseUser.user_id;
  const newDate = new Date();
  const query = `
  INSERT INTO tweet(tweet,user_id,date_time)
  VALUES(
      '${tweet}',
      '${userId}',
      '${newDate}'
  )`;
  await db.run(query);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const getUserId = `SELECT user_id FROM user WHERE username='${username}'`;
  const responseUser = await db.get(getUserId);
  const userId = responseUser.user_id;
  const ifValidQuery = `
  SELECT follower.following_user_id 
  FROM follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id
  WHERE follower.follower_user_id='${userId}' and tweet.tweet_id='${tweetId}'`;
  const validUsers = await db.all(ifValidQuery);
  if (validUsers !== undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const query = `
        DELETE FROM tweet
        WHERE tweet_id='${tweetId}' and user_id='${userId}'`;
    await db.run(query);
    response.send("Tweet Removed");
  }
});

module.exports = app;
